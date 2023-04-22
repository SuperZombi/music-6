import os
import shutil
import time
from pathlib import Path
import datetime
from dateutil import parser as dataparse
from flask import Flask, request, jsonify, send_from_directory, send_file, abort, redirect, Response
import requests
from flask_cors import CORS
from flask_socketio import SocketIO, emit
import json
from user_agents import parse as ua_parse
from urllib.parse import urlparse
import filetype
from PIL import Image, ImageSequence
from io import BytesIO
import audio_metadata
import subprocess
import warnings
warnings.filterwarnings('ignore')
from fuzzywuzzy import fuzz
import re
import copy
from tools.DataBase import DataBase
from tools.serverErrors import Errors
from tools.BrootForceProtection import BrootForceProtection
from tools.systemMessages import systemMessage
import tools.htmlTemplates as htmlTemplates
from textwrap import dedent
import random
import math
from threading import Thread
import sqlite3
from tools import predict_ai
app = Flask(__name__)
app.config['JSON_AS_ASCII'] = False
CORS(app)

HEADERS = {'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/81.0.4044.138 Safari/537.36'}

limits = {'image': {'size': 2097152, 'resolution': 1280, 'extensions': ['.jpg', '.png', '.jpeg']},
		  'audio': {'size': 10485760, 'bitrate': 192}}
premium_limits = {'image': {'size': 8388608, 'resolution': 1920, 'extensions': ['.jpg', '.png', '.gif', '.jpeg']},
				  'audio': {'size': 16777216, 'bitrate': 320}}

bonus_codes = {
	"FreeTrial": {"valid_until": -1, 'action': lambda usr, code: bonus_code_premium(usr, code, "7_days")},
	"NEWYEAR2023": {"valid_until": "07.01.2023", 'action': lambda usr, code: bonus_code_premium(usr, code, "12_days")}
}
bonus_codes = {k.upper(): v for k, v in bonus_codes.items()}

with sqlite3.connect('database/messages.db') as conn:
	c = conn.cursor()
	c.execute('''
		CREATE TABLE IF NOT EXISTS "messages" (
			"id"        INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
			"from_user" TEXT NOT NULL,
			"to_user"   TEXT NOT NULL,
			"message"   TEXT,
			"time"      NUMERIC,
			"is_read"   INTEGER DEFAULT 0
		);
	''')
	conn.commit()


def refit_ai():
	predict_ai.init("database/users.bd", "database/tracks.bd")
	def setTimeout(x):
		time.sleep(x)
		predict_ai.init("database/users.bd", "database/tracks.bd")
	Thread(target=setTimeout, daemon=True, args=(600,)).start()

refit_ai()


@app.route("/status")
def status():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	ua = ua_parse(request.headers.get('User-Agent'))
	ua_device = ua.is_pc and "PC" or ua.device.family
	ua_os = ("%s %s" % (ua.os.family, ua.os.version_string)).strip()
	return jsonify({'online': True, 'time': int(time.time()),
					'ip': ip, "device": ua_device, "os": ua_os})


@app.route("/api/get_recommends", methods=["POST"])
def get_recommends():
	userName = request.json.get('user')
	if userName:
		try:
			answer = predict_ai.make_predict_for_user(userName)
			answer = answer.values.tolist()
			final = []
			for track_id, x in answer:
				track_index = tracks.find(path=list(Path(track_id).parts))
				track_info = copy.deepcopy(tracks.get(track_index))
				track_info['rating'] = round(x, 4)
				final.append(track_info)
			return jsonify({"successfully": True, "tracks": final})
		except: None
	return jsonify({"successfully": False})


@app.route("/")
def index():
	return send_from_directory('data', 'index.html')

@app.errorhandler(404)
def page_not_found(e):
	return send_from_directory('data', '404.html'), 404
@app.errorhandler(403)
def page_not_found(e):
	return send_from_directory('data', '403.html'), 403

def render(path):
	parts = Path(path).parts
	if parts[0] != "account":
		if len(parts) > 2:
			if os.path.basename(path) == "embed":
				return htmlTemplates.track_embed()
		elif len(parts) == 2:
			if path[-1] != "/":
				return redirect("/" + path + "/")
			track_id = tracks.find(path=list(parts))
			if track_id != None:
				stat_check_html(os.path.join(path, "index.html"))
				track = tracks.get(track_id)
				image = os.path.join(request.base_url, track["image"]).replace("\\", "/")
				return htmlTemplates.track_index(track["artist"], track["track"], image)
		elif len(parts) == 1:
			if path[-1] != "/":
				return redirect("/" + path + "/")
			user_id = users.find(path=parts[0])
			user = users.get(user_id)
			if user:
				image = None
				if user["image"]:
					image = os.path.join(request.base_url, user["image"]).replace("\\", "/")
				args = filter(lambda v: v is not None, [user_id, image])
				return htmlTemplates.artist_index(*args)


@app.route('/<path:filepath>')
def data(filepath):
	p = os.path.join("data", filepath)
	if os.path.exists(p):
		if os.path.isfile(p):
			if filetype.is_image(p):
				if 'size' in request.args.keys():
					if request.args['size'] == "small":
						try:
							img = Image.open(p)
							buf = BytesIO()
							if 'loop' in img.info:
								frames = ImageSequence.Iterator(img)
								def resize(frames, size):
									for frame in frames:
										thumbnail = frame.copy()
										thumbnail.thumbnail(size, Image.ANTIALIAS)
										yield thumbnail

								frames = list(resize(frames, (200, 200)))
								frames[0].save(buf, img.format, save_all=True, append_images=frames)
							else:
								img.thumbnail((200, 200), Image.ANTIALIAS)
								img.save(buf, img.format)

							buf.seek(0)
							return send_file(buf, mimetype=filetype.guess(p).mime)
						except:
							None
			elif filetype.is_audio(p):
				start = request.args.get('start')
				end = request.args.get('end')

				if start or end:
					output_file = BytesIO()

					time_command = []
					if start:
						time_command.extend(['-ss', str(datetime.timedelta(seconds=float(start) ))] )
					else:
						time_command.extend(['-ss', str(datetime.timedelta(seconds=0))] )
					if end:
						time_command.extend(['-to', str(datetime.timedelta(seconds=float(end) ))] )
					command = ['ffmpeg', '-i', p, *time_command, '-map', '0:0', '-c', 'copy', '-f', 'mp3', '-']
					proc = subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
					stdout, stderr = proc.communicate()

					if proc.returncode != 0:
						print(stderr)
						abort(416)
					else:
						output_file.write(stdout)

					output_file.seek(0)
					return send_file(output_file, mimetype=filetype.guess(p).mime)

			return send_from_directory('data', filepath)

		if filepath[-1] != "/":
			return redirect("/" + filepath + "/")

	if os.path.isfile(os.path.join(p, "index.html")):
		return send_from_directory('data', os.path.join(filepath, "index.html"))
	if os.path.isfile(p + ".html"):
		return send_from_directory('data', filepath + ".html")
	if os.path.basename(filepath).endswith(".html"):
		return redirect("/" + filepath.removesuffix('.html'))
	if os.path.basename(filepath) == "index":
		return redirect("/" + os.path.dirname(filepath) + "/")

	answer = render(filepath)
	if answer: return answer
	abort(404)

@app.route("/api/lang_detect")
def lang_detect():
	return send_from_directory('tools', 'lang_detect.html')

@app.route("/api/decode_error", methods=["POST"])
def get_error_value():
	if 'lang' in request.json.keys():
		lang = request.json['lang'].lower()

	try:
		temp = Errors[request.json['code']].value
		if isinstance(temp, dict):
			if lang in temp.keys():
				return {'successfully': True, 'value': temp[lang]}
			return {'successfully': True, 'value': temp['en']} # default
		return temp
	except:
		return {'successfully': False}


def stat_check_html(file):
	def stat_check(path):
		path = os.path.dirname(path)
		def is_track_path(path):
			parts = Path(path).parts
			if len(parts) == 2 and parts[0] != "account":
				return True
			return False

		if is_track_path(path):
			track = tracks.find(path=list(Path(path).parts))
			tracks.get(track)['statistics']["views"] += 1
			tracks.save()

	if os.path.splitext(file)[-1] == ".html":
		if Path(file).parts[0] != "root_":
			try: stat_check(file)
			except: None


@app.route("/ad_s")
def ads():
	f = []
	for (dirpath, dirnames, filenames) in os.walk(os.path.join("data", "ad_s")):
		f.extend(filenames)
		break

	rand_file = os.path.join("data", "ad_s", random.choice(f))
	with open(rand_file, "r", encoding="utf-8") as file:
		data = json.loads(file.read())
	with open(rand_file, "w", encoding="utf-8") as file:
		if "views" in data.keys():
			data["views"] += 1
		else: data["views"] = 1
		file.write(json.dumps(data, indent=4, ensure_ascii=False))

	ads_lang = "en"
	if 'lang' in request.args:
		if request.args["lang"].lower() in data["text"].keys():
			ads_lang = request.args["lang"].lower()

	desc = data["description"][ads_lang] if data.get("description") else ""
	but = data["button"][ads_lang] if data.get("button") else ""
	return htmlTemplates.ads(data['image'], data["text"][ads_lang], data["link"], desc, but)


tracks = DataBase("database/tracks.bd")
users = DataBase("database/users.bd", unique="user")

# Method not implemented
# from math import sqrt
# def wilson_score(likes, views, votes_range = [0, 1]):
# 	if likes > views: return 1
# 	z = 1.64485
# 	v_min = min(votes_range)
# 	v_width = float(max(votes_range) - v_min)
# 	phat = (likes - views * v_min) / v_width / float(views)
# 	rating = (phat+z*z/(2*views)-z*sqrt((phat*(1-phat)+z*z/(4*views))/views))/(1+z*z/views)
# 	return rating * v_width + v_min

def my_rating(likes, views):
	if likes == 0 or views == 0: return 0
	return (likes / views * likes) * (views / likes * views)


def sort_tracks(tracks, by):
	if by == "date":
		temp = copy.deepcopy(tracks)
		for i in temp:
			i['popular'] = my_rating(i["statistics"]["likes"], i["statistics"]["views"])
		tracks = sorted(temp, key=lambda x: dataparse.parse(x["date"], dayfirst=True) , reverse=True)
	elif by == "popular":
		tracks = sorted(tracks, key=lambda x: my_rating(x["statistics"]["likes"], x["statistics"]["views"]), reverse=True)
	elif by == "likes" or by == "views":
		tracks = sorted(tracks, key=lambda x: x["statistics"][by], reverse=True)
	return tracks

@app.route('/api/get_tracks', methods=["POST"])
def get_tracks():
	allowed_sort_methods = ["date", "popular", "likes", "views"]
	sort_method = "date"
	if 'sort_method' in request.json.keys():
		if request.json['sort_method'] in allowed_sort_methods:
			sort_method = request.json['sort_method']

	if 'user' in request.json.keys():
		user = users.get(request.json['user'])
		if user:
			temp = {}
			temp['path'] = request.json['user'].lower().replace(" ", "-")
			temp['tracks'] = []

			ids = tracks.find_all(artist=request.json['user'])
			for id in ids:
				track = tracks.get(id)
				temp['tracks'].append(track)

			temp['tracks'] = sort_tracks(temp['tracks'], by=sort_method)

			return jsonify({'successfully': True, **temp})
		else:
			return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})

	temp = sort_tracks(tracks.data, by=sort_method)
	return jsonify({'successfully': True, 'tracks': temp})



def register_user(data):
	user_name = data.pop('name')
	users.add(
		user=user_name,
		password=data.pop('password'),
		registration_time=int(time.time()),
		role="user",
		image=None,
		path=user_name.lower().replace(" ", "-"),
		**data
	)

def edit_user(user, data):
	for i in data.keys():
		if i == "social":
			if user.get('advantages'):
				if user['advantages'].get('verified_with'):
					socials = user.get('social', [])
					old_link = next((link for link in socials if user['advantages'].get('verified_with') in link), "")
					new_link = next((link for link in data[i] if user['advantages'].get('verified_with') in link), "")
					if old_link != new_link:
						del user['advantages']["official"]
						del user['advantages']["verified_with"]

		if i == "name" or i == "password" or i == "public_fields":
			pass
		else:
			if isinstance(data[i], bool):
				user[i] = data[i]
			elif isinstance(data[i], list):
				data[i] = list(filter(lambda x: x.strip() != "", data[i]))
				if len(data[i]) == 0:
					if i in user.keys():
						del user[i]
				else:
					user[i] = data[i]
			else:
				if data[i].strip() == "":
					if i in user.keys():
						del user[i]
				else:
					user[i] = data[i]

	publicFields = []
	if "public_fields" in data.keys():
		for i in data["public_fields"]:
			if i in data["public_fields"] and i in user.keys():
				publicFields.append(i)
	if len(publicFields) == 0:
		if "public_fields" in user.keys():
			del user["public_fields"]
	else:
		user["public_fields"] = publicFields

	users.save()



def get_ip_info_location(ip):
	response = requests.get(f'https://ipapi.co/{ip}/json/', headers = HEADERS).json()
	location_data = {
		"city": response.get("city"),
		"region": response.get("region"),
		"country": response.get("country_name")
	}
	return dict(filter(lambda x:x[1], location_data.items() ))

@app.route("/api/logins", methods=["POST"])
def logins():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['name'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		user = dict(**users.get(request.json['name']))
		logins = dict(user.get("logins", {}))
		for key in logins.keys():
			logins[key] = dict(**logins[key], **get_ip_info_location(key))
		if ip in logins.keys():
			logins[ip]["current"] = True
		logins = sorted(logins.items(), key=lambda x: x[1]['time'], reverse=True)
		return jsonify({'successfully': True, "logins": logins})
	return jsonify(x)

@app.route("/api/delete_login", methods=["POST"])
def delete_login():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['name'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		user = users.get(request.json['name'])
		if "logins" in user.keys():
			if request.json['ip'] in user["logins"].keys():
				del user["logins"][request.json['ip']]
				users.save()
				return jsonify({'successfully': True})
		return jsonify({'successfully': False})
	return jsonify(x)


@app.route("/api/name_available", methods=["POST"])
def name_available():
	if "/" in request.json['name'] or "\\" in request.json['name']:
		return jsonify({'available': False, 'reason': Errors.forbidden_character.name})
	if users.get(request.json['name']):
		return jsonify({'available': False, 'reason': Errors.name_already_taken.name})
	user_folder = os.path.join("data", request.json['name'].lower().replace(" ", "-"))
	if os.path.exists(user_folder):
		return jsonify({'available': False, 'reason': Errors.creating_folder_error.name})
	return jsonify({'available': True})

@app.route("/api/register", methods=["POST"])
def register():
	if "/" in request.json['name'] or "\\" in request.json['name']:
		return jsonify({'successfully': False, 'reason': Errors.forbidden_character.name})
	for key, value in request.json.items():
		if key == "email":
			if users.find(email=value):
				return jsonify({'successfully': False, 'reason': Errors.email_already_taken.name})
		if len(value.strip()) == 0:
			return jsonify({'successfully': False, 'reason': Errors.forbidden_character.name})
	
	if request.json['name'].lower() == "admin" or request.json['name'].lower() == "system":
		return jsonify({'successfully': False, 'reason': Errors.name_already_taken.name})
	if users.get(request.json['name']):
		return jsonify({'successfully': False, 'reason': Errors.name_already_taken.name})
	if users.find(email=request.json['name']):
		return jsonify({'successfully': False, 'reason': Errors.name_already_taken.name})
	try:
		user_folder = os.path.join("data", request.json['name'].lower().replace(" ", "-"))
		if not os.path.exists(user_folder):
			os.makedirs(user_folder)
		else:
			return jsonify({'successfully': False, 'reason': Errors.creating_folder_error.name})
	except:
		return jsonify({'successfully': False, 'reason': Errors.creating_folder_error.name})

	try:
		register_user(request.json)
		return jsonify({'successfully': True})
	except:
		shutil.rmtree(user_folder)
		return jsonify({'successfully': False, 'reason': Errors.invalid_parameters.name})

def fast_login(user, password):
	data = users.get(user)
	if data:
		if data['password'] == password:
			data['last_online'] = int(time.time())
			info = dict(data.get("logins", {}))
			ip = request.headers.get('X-Forwarded-For', request.remote_addr)

			ua = ua_parse(request.headers.get('User-Agent'))
			ua_device = ua.is_pc and "PC" or ua.device.family
			ua_os = ("%s %s" % (ua.os.family, ua.os.version_string)).strip()
			if ua.is_mobile: type_ = "smartphone"
			elif ua.is_pc: type_ = "pc"
			else: type_ = "other"
			info[ip] = {"device": ua_device, "os": ua_os, "type": type_}

			info[ip]["time"] = int(time.time())
			data["logins"] = info
			users.save()
			return True
	return False

@app.route("/api/login", methods=["POST"])
def login():
	def send_message():
		try:
			ua = ua_parse(request.headers.get('User-Agent'))
			ua_device = ua.is_pc and "PC" or ua.device.family
			ua_os = ("%s %s" % (ua.os.family, ua.os.version_string)).strip()
			location = get_ip_info_location(ip)
			loc = ", ".join([location.get('city'), location.get('country')])
			send_system_message(request.json['name'], systemMessage.login.value.format(
				system=ua_os, device=ua_device, location=loc)
			)
		except: None

	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['name'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		send_message()
	if not x['successfully']:
		identifier = users.find(email=request.json['name'])
		if identifier:
			x = BrootForceProtection(identifier, request.json['password'], ip, fast_login)()
			if x['successfully']:
				send_message()
				x['username'] = identifier
				return jsonify(x)
		else:
			x['reason'] = Errors.incorrect_name_or_password.name
	return jsonify(x)

@app.route("/api/reset", methods=["POST"])
def reset():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['old_password'], ip, fast_login)()
	if x['successfully']:
		user = users.get(request.json['user'])
		user["password"] = request.json['new_password']
		users.save()
		send_system_message(request.json['user'], systemMessage.password_reset.value)
		return jsonify({'successfully': True})
	else:
		x['reason'] = Errors.incorrect_name_or_password.name
	return jsonify(x)



@app.route("/api/search", methods=["POST"])
def search():
	def search_track(text):
		final = []
		for track in tracks.data:
			confidence = fuzz.partial_ratio(track['track'].lower(), text.lower())
			if confidence > 66:
				final.append({'track': track, 'confidence': confidence})
				continue
			artist_confidence = fuzz.partial_ratio(track['artist'].lower(), text.lower())
			if artist_confidence > 75:
				final.append({'track': track, 'confidence': confidence})
				continue
		sorted_final = sorted(final, key=lambda x: x["confidence"] , reverse=True)
		final_tracks = list(map(lambda x: x['track'], sorted_final))
		return final_tracks

	def search_user(text):
		final = []
		for user in users.data.keys():
			confidence = fuzz.partial_ratio(user.lower(), text.lower())
			if confidence > 80:
				user_folder_public = user.lower().replace(" ", "-")
				_user = users.get(user)
				if _user['image']:
					image = os.path.join(request.origin, os.path.normpath(os.path.join(user_folder_public, _user['image']))).replace("\\", "/")
				else:
					image = f"https://ui-avatars.com/api/?name={user}&length=1&color=fff&background=random&bold=true&format=svg&size=512"
				
				temp = {"user": user, "path": user.lower().replace(" ", "-"), "image": image, "confidence": confidence}
				final.append(temp)
		sorted_final = sorted(final, key=lambda x: x["confidence"] , reverse=True)
		return sorted_final

	def search_genre(text):
		final = []
		for track in tracks.data:
			confidence = fuzz.partial_ratio(track['genre'].lower(), text.lower())
			if confidence > 80:
				final.append(track)
		return final

	def search_all_genre():
		final = map(lambda track: track['genre'], tracks.data)
		return list(set(final))


	if request.json['type'] == "track":
		return jsonify(search_track(request.json['text']))
	elif request.json['type'] == "user":
		return jsonify(search_user(request.json['text']))
	elif request.json['type'] == "genre":
		return jsonify(search_genre(request.json['text']))
	elif request.json['type'] == "all_genres":
		return jsonify(search_all_genre())
	else:
		return "404"


def parse_boolean(value):
	if value == True or value == "true" or value == "True":
		return True
	return False

def make_config(data, files):
	config = {}
	config["track_name"] = data["track_name"]
	config["artist"] = data["artist"]
	config["main_img"] = files["image"].filename
	config["allow_download"] = parse_boolean(data["allow_download"])
	config["download_file"] = files["audio"].filename
	config["audio_preview"] = files["audio"].filename

	config["show_time"] = True
	config["animate_time"] = True

	links = {}
	hosts = ['spotify', 'youtube_music', 'youtube', 'apple_music', 'deezer', 'soundcloud', 'newgrounds']
	for i in hosts:
		if i in data.keys():
			links[i] = data[i]
	if links:
		config['links'] = links

	return config

def edit_config(data, old_data):
	old_data["allow_download"] = parse_boolean(data["allow_download"])
	old_data["preview_z"] = parse_boolean(data["preview_z"])
	if "preview_zone" in data.keys():
		old_data["preview_zone"] = list(map(float, data["preview_zone"].split(",")))
	links = {}
	hosts = ['spotify', 'youtube_music', 'youtube', 'apple_music', 'deezer', 'soundcloud', 'newgrounds']
	for i in hosts:
		if i in data.keys():
			links[i] = data[i]
	if links:
		old_data['links'] = links
	return old_data


def premium_available(user):
	if 'advantages' in user.keys() and 'premium' in user['advantages'].keys():
		if user['advantages']['premium'] == -1: return True
		if user['advantages']['premium'] > int(time.time()):
			return True
		else:
			del user['advantages']['premium']
			if not len(user['advantages'].keys()) > 0:
				del user['advantages']
			users.save()
			return False

def is_banned(user):
	if 'role' in user.keys() and user['role'] == "banned":
		if "banned_until" in user.keys():
			if user["banned_until"] < int(time.time()):
				user['role'] = "user"
				del user["banned_until"]
				return False
		return True
	return False

@app.route('/api/get_file_limits', methods=['POST'])
def get_file_limits():
	user = users.get(request.json['user'])
	cur_limits = limits
	if premium_available(user):
		cur_limits = premium_limits
	return jsonify({'successfully': True, 'limits': cur_limits})

@app.route('/api/uploader', methods=['POST'])
def upload_file():
	if request.method == 'POST':
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.form['artist'], request.form['password'], ip, fast_login)()
		if x['successfully']:
			user = users.get(request.form['artist'])
			if is_banned(user):
				return jsonify({'successfully': False, 'reason': Errors.you_are_banned.name})

			cur_limits = limits
			if premium_available(user):
				cur_limits = premium_limits

			user_folder = os.path.join("data", request.form['artist'].lower().replace(" ", "-"))
			track_folder = os.path.join(user_folder, request.form['track_name'].lower().replace(" ", "-"))

			if os.path.exists(user_folder):
				if "/" in request.form['track_name'] or "\\" in request.form['track_name']:
					return jsonify({'successfully': False, 'reason': Errors.track_forbidden_character.name})

				if tracks.find(artist=request.form['artist'], track=request.form['track_name']):
					return jsonify({'successfully': False, 'reason': Errors.track_already_exists.name})

				if not os.path.exists(track_folder):
					os.makedirs(track_folder)

					for i in request.files:
						f = request.files[i]

						if f.mimetype.split('/')[0] == 'image':
							_, extension = os.path.splitext(f.filename)
							if extension in cur_limits['image']['extensions']:
								image_bytes = BytesIO(f.stream.read())
								blob = image_bytes.read()
								filesize = len(blob)
								if filesize <= cur_limits['image']['size']:
									img = Image.open(image_bytes)
									w, h = img.size
									if w <= cur_limits['image']['resolution'] and h <= cur_limits['image']['resolution']:
										with open(os.path.join(track_folder, f.filename),'wb') as file:
											file.write(blob)
									else:
										shutil.rmtree(track_folder)
										return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
								else:
									shutil.rmtree(track_folder)
									return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
							else:
								shutil.rmtree(track_folder)
								return jsonify({'successfully': False, 'reason': Errors.wrong_file_format.name})

						elif f.mimetype.split('/')[0] == 'audio':
							_, extension = os.path.splitext(f.filename)
							if extension == ".mp3":
								audio_bytes = BytesIO(f.stream.read())
								blob = audio_bytes.read()
								filesize = len(blob)
								if filesize <= cur_limits['audio']['size']:
									try:
										metadata = audio_metadata.loads(blob)
									except Exception as e:
										print(e)
										shutil.rmtree(track_folder)
										return jsonify({'successfully': False, 'reason': Errors.wrong_file_format.name})
										
									bitrate = metadata.streaminfo.bitrate / 1000
									if bitrate <= cur_limits['audio']['bitrate']:
										with open(os.path.join(track_folder, f.filename),'wb') as file:
											file.write(blob)
									else:
										shutil.rmtree(track_folder)
										return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
								else:
									shutil.rmtree(track_folder)
									return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
							else:
								shutil.rmtree(track_folder)
								return jsonify({'successfully': False, 'reason': Errors.wrong_file_format.name})


					try:
						config = make_config(request.form.to_dict(), request.files.to_dict())
						with open(os.path.join(track_folder, 'config.json'), 'w', encoding='utf8') as file:
							file.write('config = ' + json.dumps(config, indent=4, ensure_ascii=False))
						
						date = dataparse.parse(request.form['release_date'])
						date_str = f'{str(date.day).zfill(2)}.{str(date.month).zfill(2)}.{date.year}'

						tracks.add(track=request.form['track_name'],
								artist=request.form['artist'],
								genre=request.form['genre'],
								image=request.files['image'].filename,
								date=date_str,
								path=[
									request.form['artist'].lower().replace(" ", "-"),
									request.form['track_name'].lower().replace(" ", "-")
								],
								statistics={"likes": 0, "views": 0}
								)
						
						url = request.form['artist'].lower().replace(" ", "-") + "/" + request.form['track_name'].lower().replace(" ", "-")
						return jsonify({'successfully': True, 'url': url})

					except Exception as e:
						print(e)
						shutil.rmtree(track_folder)
						return jsonify({'successfully': False, 'reason': Errors.invalid_parameters.name})
			
			return jsonify({'successfully': False, 'reason': Errors.creating_folder_error.name})

		else:
			return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})



def delete_track_func(user, track):
	user_folder = os.path.join("data", user.lower().replace(" ", "-"))
	track_folder = os.path.join(user_folder, track.lower().replace(" ", "-"))
	if os.path.exists(track_folder):
		shutil.rmtree(track_folder)

		track_id = tracks.find(artist=user, track=track)
		tracks.delete(track_id)
		return True
	else:
		return False

@app.route('/api/delete_track', methods=['POST'])
def delete_track():
	if request.method == 'POST':
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.json['artist'], request.json['password'], ip, fast_login)()
		if x['successfully']:
			if delete_track_func(request.json['artist'], request.json['track_name']):
				return jsonify({'successfully': True})
			return jsonify({'successfully': False, 'reason': Errors.track_dont_exists.name})
		else:
			return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})


def get_track_info_json(path, other_track_info):
	with open(path, 'r', encoding='utf8') as file:
		lines = file.readlines()
		string = "".join(filter(lambda x: x.strip()[:2] != "//", lines)) # remove comments
		string = string.split('=', 1)[1]
		config = json.loads(string)
		config['date'] = other_track_info['date']
		config['genre'] = other_track_info['genre']
	return config

@app.route('/api/get_track_info', methods=['POST'])
def get_track_info():
	try:
		track = tracks.find(artist=request.json['artist'], track=request.json['track'])
		if track:
			try:
				user_folder = os.path.join("data", request.json['artist'].lower().replace(" ", "-"))
				track_folder = os.path.join(user_folder, request.json['track'].lower().replace(" ", "-"))
				track_inf = tracks.get(track)
				config = get_track_info_json(os.path.join(track_folder, 'config.json'), track_inf)
				return jsonify({'successfully': True, 'config': config})
			except:
				return jsonify({'successfully': False, 'reason': Errors.error_working_files.name})
		else:
			return jsonify({'successfully': False, 'reason': Errors.track_dont_exists.name})
	except:
		return jsonify({'successfully': False, 'reason': Errors.invalid_parameters.name})

@app.route('/api/edit_track', methods=['POST'])
def edit_track_api():
	if request.method == 'POST':
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.form['artist'], request.form['password'], ip, fast_login)()
		if x['successfully']:
			user_folder = os.path.join("data", request.form['artist'].lower().replace(" ", "-"))
			track_folder = os.path.join(user_folder, request.form['track_name'].lower().replace(" ", "-"))

			if os.path.exists(track_folder):
				try:
					track = tracks.find(artist=request.form['artist'], track=request.form['track_name'])
					track_inf = tracks.get(track)
					old_config = get_track_info_json(os.path.join(track_folder, 'config.json'), track_inf)

					config = edit_config(request.form.to_dict(), old_config)
					with open(os.path.join(track_folder, 'config.json'), 'w', encoding='utf8') as file:
						file.write('config = ' + json.dumps(config, indent=4, ensure_ascii=False))
					
					date = dataparse.parse(request.form['release_date'])
					date_str = f'{str(date.day).zfill(2)}.{str(date.month).zfill(2)}.{date.year}'

					track_inf['genre'] = request.form['genre']
					track_inf['date'] = date_str
					
					tracks.save()
					
					url = request.form['artist'].lower().replace(" ", "-") + "/" + request.form['track_name'].lower().replace(" ", "-")
					return jsonify({'successfully': True, 'url': url})

				except Exception as e:
					print(e)
					return jsonify({'successfully': False, 'reason': Errors.invalid_parameters.name})
			
			return jsonify({'successfully': False, 'reason': Errors.error_working_files.name})

		else:
			return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})




@app.route('/api/get_profile_photo', methods=['POST'])
def get_profile_photo():
	user = users.get(request.json['artist'])
	if user and 'image' in user.keys():
		user_folder_public = request.json['artist'].lower().replace(" ", "-")
		if user['image']:
			return jsonify({'successfully': True, 'image':
				os.path.join(request.origin, os.path.normpath(os.path.join(user_folder_public, user['image']))).replace("\\", "/")
			})
		else:
			return jsonify({'successfully': True, 'image':
				f"https://ui-avatars.com/api/?name={request.json['artist']}&length=1&color=fff&background=random&bold=true&format=svg&size=512"
			})

	return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})

@app.route('/api/change_profile_photo', methods=['POST'])
def change_profile_photo():
	if request.method == 'POST':
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.form['artist'], request.form['password'], ip, fast_login)()
		if x['successfully']:
			user = users.get(request.form['artist'])
			if not user:
				return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})

			user_folder = os.path.join("data", request.form['artist'].lower().replace(" ", "-"))
			old_image_path = ""
			if user['image']:
				old_image_path = os.path.normpath(os.path.join(os.path.abspath(user_folder), user['image']))
				
			if 'delete' in request.form.keys():
				if not user['image']:
					return jsonify({'successfully': True})
				user['image'] = None
				users.save()
				if os.path.isfile(old_image_path):
					os.remove(old_image_path)
					return jsonify({'successfully': True})

			cur_limits = limits
			if premium_available(user):
				cur_limits = premium_limits

			try:
				f = request.files['image']
				if f.mimetype.split('/')[0] == 'image':
					_, extension = os.path.splitext(f.filename)
					if extension in cur_limits['image']['extensions']:
						image_bytes = BytesIO(f.stream.read())
						blob = image_bytes.read()
						filesize = len(blob)
						if filesize <= cur_limits['image']['size']:
							img = Image.open(image_bytes)
							w, h = img.size
							if w <= cur_limits['image']['resolution'] and h <= cur_limits['image']['resolution']:
								if os.path.isfile(old_image_path):
									os.remove(old_image_path)
								with open(os.path.join(user_folder, f.filename),'wb') as file:
									file.write(blob)

								user['image'] = f.filename
								users.save()
							else:
								return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
						else:
							return jsonify({'successfully': False, 'reason': Errors.file_is_too_big.name})
					else:
						return jsonify({'successfully': False, 'reason': Errors.wrong_file_format.name})
				else:
					return jsonify({'successfully': False, 'reason': Errors.wrong_file_format.name})
			except:
				return jsonify({'successfully': False, 'reason': Errors.error_working_files.name})

			return jsonify({'successfully': True})
		else:
			return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})


@app.route('/api/get_user_from_path', methods=['POST'])
def get_user_from_path():
	for user in users.data.keys():
		if request.json['path'] == user.lower().replace(" ", "-"):
			return jsonify({'successfully': True, 'user': user})
	return jsonify({'successfully': False})


@app.route('/api/get_profile_info', methods=['POST'])
def get_profile_info():
	user = users.get(request.json['user'])
	if user:
		is_banned(user)
		premium_available(user)
		path = "/" + request.json['user'].lower().replace(" ", "-")
		answer = {'path': path}
		
		if 'role' in user.keys():
			answer['role'] = user['role']
			if user['role'] == 'admin':
				answer['is_admin'] = True
			if user['role'] == 'banned' and "banned_until" in user.keys():
				answer['banned'] = user["banned_until"]

		if 'advantages' in user.keys():
			if 'premium' in user['advantages'].keys():
				answer['premium'] = user['advantages']['premium']
			if 'official' in user['advantages'].keys():
				answer['official'] = user['advantages']['official']

		if 'used_bonus_codes' in user.keys():
			if "FREETRIAL" in user['used_bonus_codes']:
				answer['used_free_trial'] = True
		
		return jsonify({'successfully': True, **answer})
	else:
		return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})

@app.route('/api/get_user_profile', methods=['POST'])
def get_user_profile():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['name'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		user = users.get(request.json['name'])
		if user:
			temp = dict(user)
			del temp['password']
			del temp['registration_time']
			if 'logins' in temp.keys():
				del temp['logins']
			return jsonify({'successfully': True, 'data': temp})
		else:
			return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})
	else:
		return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/get_user_profile_public', methods=['POST'])
def get_user_profile_public():
	user = users.get(request.json['user'])
	if user:
		premium_available(user)
		temp = dict(user)
		answer = {}
		answer["public_fields"] = {}
		answer["public_fields"]["receive-messages"] = user.get("receive-messages", True)
		if "public_fields" in temp.keys():
			for i in temp["public_fields"]:
				try: answer["public_fields"][i] = temp[i]
				except: pass
		if "advantages" in temp.keys():
			answer["advantages"] = {}
			for key, item in temp["advantages"].items():
				if key == "verified_with": None
				else:
					answer["advantages"][key] = item
		if "social" in temp.keys():
			answer["social"] = temp["social"]

		return jsonify({'successfully': True, **answer})
	else:
		return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})

@app.route('/api/edit_user_profile', methods=['POST'])
def edit_user_profile():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['name'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		user = users.get(request.json['name'])
		if user:
			if request.json.get("email"):
				if request.json.get("email") != user.get("email") and users.find(email=request.json.get("email")):
					return jsonify({'successfully': False, 'reason': Errors.email_already_taken.name})
			edit_user(user, request.json)
			return jsonify({'successfully': True})
		else:
			return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})
	else:
		return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})


@app.route('/api/get_statistic', methods=["POST"])
def get_statistic():
	track_dir = Path(os.path.dirname(request.json['url'])).parts
	clear_track_dir = list(filter(lambda x: x != "\\" and x != "/", track_dir))
	track_id = tracks.find(path=clear_track_dir)
	track = tracks.get(track_id)
	statistic = track['statistics']
	if ('user' in request.json.keys() and 'password' in request.json.keys()):
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
		if x['successfully']:
			user = users.get(request.json['user'])
			favorites = []
			if 'favorites' in user.keys():
				favorites = user['favorites']
			if os.path.join(*clear_track_dir) in favorites:
				return jsonify({'statistic': statistic, 'liked': True})
	return jsonify({'statistic': statistic})

@app.route('/api/like', methods=["POST"])
def like():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		track_dir = Path(os.path.dirname(request.json['url'])).parts
		clear_track_dir = list(filter(lambda x: x != "\\" and x != "/", track_dir))
		clear_track_dir_str = os.path.join(*clear_track_dir)
		track_id = tracks.find(path=clear_track_dir)
		statistic = {"likes":0}
		if track_id:
			track = tracks.get(track_id)
			statistic = track['statistics']
		user = users.get(request.json['user'])
		favorites = []
		if 'favorites' in user.keys():
			favorites = user['favorites']
		if clear_track_dir_str in favorites:
			favorites.remove(clear_track_dir_str)
			statistic["likes"] = max(statistic["likes"] - 1, 0)
			event = "unliked"
		else:
			favorites.append(clear_track_dir_str)
			statistic["likes"] += 1
			event = "liked"

		if len(favorites) == 0:
			del user['favorites']
		else:
			user['favorites'] = favorites
		users.save()
		tracks.save()

		return jsonify({'successfully': True, "event": event})
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/get_favorites', methods=['POST'])
def get_favorites():
	def get_favs(user_data):
		favorites = []
		if 'favorites' in user_data.keys():
			favorites = user_data['favorites']
		favorites_new = []
		for i in favorites:
			track_id = tracks.find(path=list(Path(i).parts))
			if track_id:
				track = tracks.get(track_id)
			else:
				track = {'track': "Deleted Track", 'status': 'deleted', 'path': list(Path(i).parts)}
			favorites_new.append(track)
		return favorites_new

	user_data = users.get(request.json['user'])
	if ('password' in request.json.keys()):
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
		if x['successfully']:
			favs = get_favs(user_data)
			return jsonify({'successfully': True, "favorites": favs})

	if "public_favorites" in user_data:
		if user_data["public_favorites"]:
			favs = get_favs(user_data)
			return jsonify({'successfully': True, "favorites": favs})

	return jsonify({'successfully': False})


def check_bonus_code(user, code):
	if code.upper() in bonus_codes.keys():
		return True
	return False

def bonus_code_premium(usr, code, premium_val):
	all_codes = usr.get('used_bonus_codes')
	if all_codes:
		all_codes.append(code)
	else:
		usr['used_bonus_codes'] = [code]

	if not 'advantages' in usr.keys():
		usr['advantages'] = {}
	time_remain = getTimeRemaining(premium_val)
	addPremiumToUser(usr['advantages'], time_remain)
	users.save()
	return {"premium": time_remain}

@app.route('/api/bonus_code', methods=['POST'])
def bonus_code():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		y = BrootForceProtection(request.json['user'], request.json['code'], "bonus_code", check_bonus_code)()
		if y['successfully']:
			usr = users.get(request.json['user'])
			if 'used_bonus_codes' in usr.keys():
				if request.json['code'].upper() in usr['used_bonus_codes']:
					return jsonify({'successfully': False, 'reason': Errors.bonus_code_already_used.name})

			if bonus_codes[request.json['code'].upper()]['valid_until'] != -1:
				date_valid = dataparse.parse(bonus_codes[request.json['code'].upper()]['valid_until'], dayfirst=True)
				date_now = datetime.datetime.now()
				if date_valid + datetime.timedelta(days=1) < date_now:
					return jsonify({'successfully': False, 'reason': Errors.bonus_code_expired.name})
				
			func = bonus_codes[request.json['code'].upper()]['action']
			result = func(usr, request.json['code'].upper())
			if result:
				return jsonify({'successfully': True, "result": result})
			return jsonify({'successfully': True})
			
		y['reason'] = Errors.too_many_wrong_attempts.name
		return jsonify({'successfully': False, **y})
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})



@app.route('/api/messenger/get_chats', methods=['POST'])
def get_chats():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		def get_chat_image(chat):
			user = users.get(chat)
			if user and user.get('image'):
				user_folder_public = chat.lower().replace(" ", "-")
				return os.path.join(request.origin, os.path.normpath(os.path.join(user_folder_public, user.get('image')))).replace("\\", "/") + "?size=small"
			else:
				return f"https://ui-avatars.com/api/?name={chat}&length=1&color=fff&background=random&bold=true&format=svg&size=512"

		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
				SELECT DISTINCT CASE
					WHEN from_user = :user THEN to_user
					ELSE from_user
				END AS chat_user,
				SUM(CASE WHEN is_read = 0 AND to_user = :user THEN 1 ELSE 0 END) AS unread_messages_count,
				MAX(time) AS last_message_time
				FROM messages
				WHERE :user IN (from_user, to_user)
				GROUP BY chat_user
				ORDER BY last_message_time DESC;
			''', {"user": request.json['user']})
			results = cursor.fetchall()
			result_array = [{"chat_name": t[0],
							"unread_messages_count": t[1],
							"readOnly": t[0].lower() == "admin" or t[0].lower() == "system",
							"chat_image": get_chat_image(t[0]),
							"online": True if socket_users.get(t[0], None) else False
							} for t in results]
			return jsonify({'successfully': True, 'chats': result_array})
		
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/messenger/get_messages', methods=['POST'])
def get_messages():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		chat_name = request.json['chat']
		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
				SELECT * FROM messages
				WHERE (from_user = :user AND to_user = :chat)
				OR (from_user = :chat AND to_user = :user);
			''', {"user": request.json['user'], "chat": chat_name})
			results = cursor.fetchall()
			column_names = [column[0] for column in cursor.description]
			result_array = [dict(zip(column_names, row)) for row in results]
			result_array = [{**d, "is_read": bool(d["is_read"])} for d in result_array]
			cursor.execute(f'''
				UPDATE messages
				SET is_read = 1
				WHERE (from_user = ? AND to_user = ?);
			''', (chat_name, request.json['user']))

			sid = socket_users.get(chat_name, None)
			if sid:
				emit('chat_readed', {"from_user": request.json['user']}, namespace='/', broadcast=True, room=sid)
			emit('user_online', {"from_user": request.json['user']}, namespace='/', broadcast=True)
			return jsonify({'successfully': True, 'messages': result_array})
		
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/messenger/send_message', methods=['POST'])
def send_message():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		user = users.get(request.json['user'])
		if is_banned(user):
			return jsonify({'successfully': False, 'reason': Errors.you_are_banned.name})

		chat_name = request.json['chat']
		if chat_name.lower() == "admin" or chat_name.lower() == "system":
			return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})
		target_user = users.get(chat_name)
		if not target_user:
			return jsonify({'successfully': False, 'reason': Errors.user_dont_exist.name})
		if not target_user.get("receive-messages", True):
			return jsonify({'successfully': False, 'reason': Errors.prohibition_sending_messages.name})

		message = request.json['message']
		time_now = int(time.time())
		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
				INSERT INTO messages (from_user, to_user, message, time)
				VALUES (?, ?, ?, '{time_now}')
				RETURNING id;
			''', (request.json['user'], chat_name, message))
			row_id = cursor.fetchone()[0]
			cursor.execute(f'''
				UPDATE messages
				SET is_read = 1
				WHERE (from_user = ? AND to_user = ?);
			''', (chat_name, request.json['user']))
			conn.commit()

			msg = {
				"id": row_id,
				"from_user": request.json['user'],
				"chat": chat_name,
				"message": message,
				"time": time_now,
				"is_read": False
			}

			sid = socket_users.get(chat_name, None)
			if sid:
				emit('new_message', msg, namespace='/', broadcast=True, room=sid)
			emit('user_online', {"from_user": request.json['user']}, namespace='/', broadcast=True)
			return jsonify({'successfully': True, "message": msg})
		
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/messenger/delete_message', methods=['POST'])
def delete_message():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		message_id = request.json['message_id']
		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
				DELETE FROM messages WHERE id = {message_id}
				RETURNING from_user, to_user;
			''')
			users_to_send = cursor.fetchone()
			users_to_send = list(filter(lambda x: x != request.json['user'], users_to_send)) if users_to_send else []
			conn.commit()
			for user in users_to_send:
				sid = socket_users.get(user, None)
				if sid:
					emit('delete_message', {"id": message_id}, namespace='/', broadcast=True, room=sid)
			emit('user_online', {"from_user": request.json['user']}, namespace='/', broadcast=True)
			return jsonify({'successfully': True})
		
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/messenger/delete_chat', methods=['POST'])
def delete_chat():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		from_user = request.json['user']
		to_user = request.json['chat']
		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
				DELETE FROM messages
				WHERE (from_user = :from_user AND to_user = :to_user)
				OR (from_user = :to_user AND to_user = :from_user);
			''', {"from_user": from_user, "to_user": to_user})
			conn.commit()
			sid = socket_users.get(to_user, None)
			if sid:
				emit('delete_chat', {"from_user": from_user}, namespace='/', broadcast=True, room=sid)
			emit('user_online', {"from_user": request.json['user']}, namespace='/', broadcast=True)
			return jsonify({'successfully': True})
		
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})

@app.route('/api/messenger/mark_chat_as_readed', methods=['POST'])
def mark_chat_as_readed():
	ip = request.headers.get('X-Forwarded-For', request.remote_addr)
	x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
	if x['successfully']:
		with sqlite3.connect('database/messages.db') as conn:
			cursor = conn.cursor()
			cursor.execute(f'''
					UPDATE messages
					SET is_read = 1
					WHERE (from_user = ? AND to_user = ?);
				''', (request.json['chat'], request.json['user']))
			conn.commit()
			sid = socket_users.get(request.json['chat'], None)
			if sid:
				emit('chat_readed', {"from_user": request.json['user']}, namespace='/', broadcast=True, room=sid)
			emit('user_online', {"from_user": request.json['user']}, namespace='/', broadcast=True)
		return jsonify({'successfully': True})
	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})


def send_system_message(user, message):
	with sqlite3.connect('database/messages.db') as conn:
		cursor = conn.cursor()
		time_now = int(time.time())
		cursor.execute(f'''
			INSERT INTO messages (from_user, to_user, message, time)
			VALUES ('SYSTEM', ?, ?, '{time_now}')
			RETURNING id;
		''', (user, message))
		row_id = cursor.fetchone()[0]
		conn.commit()
		msg = {
			"id": row_id,
			"from_user": 'SYSTEM',
			"chat": user,
			"message": message,
			"time": time_now
		}
		sid = socket_users.get(user, None)
		if sid:
			emit('new_message', msg, namespace='/', broadcast=True, room=sid)



@app.route('/api/verify_user', methods=['POST'])
def verify_user():
	def get_youtube_links(url):
		r = requests.get(f'{url}/about')
		regex = re.compile(r'"url":"(https:\/\/www\.youtube\.com\/redirect\?event=channel_description.*?)"')
		arr = regex.findall(str(r.content))
		arr = list(map(lambda x: 
						re.findall(r'q=(https:\/\/+.*)',
							requests.utils.unquote(x)
						)
			, arr))
		flat_list = [item for sublist in arr for item in sublist]
		return set(flat_list)

	user = users.get(request.json['user'])
	if user:
		ip = request.headers.get('X-Forwarded-For', request.remote_addr)
		x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
		if x['successfully']:
			if 'advantages' in user.keys() and user['advantages'].get("official"):
				return jsonify({'successfully': True})

			def convert_url(url):
				return urlparse(url)._replace(scheme='').geturl().strip("/")

			if request.json['method'] == "youtube":
				socials = user.get('social')
				if socials:
					youtube_link = next((link for link in socials if "youtube.com" in link), None)
					if youtube_link:
						user_links = get_youtube_links(youtube_link)
						required_link = convert_url(request.url_root + user.get('path'))
						result = next((True for i in user_links if convert_url(i) == required_link), False)
						if result:
							if not 'advantages' in user.keys():
								user['advantages'] = {}
							user['advantages']["official"] = True
							user['advantages']["verified_with"] = "youtube"
							users.save()
							return jsonify({'successfully': True})

				return jsonify({'successfully': False, 'reason': Errors.required_verify_link_not_found.name})
			else:
				return jsonify({'successfully': False, 'reason': Errors.invalid_verify_method.name})

	return jsonify({'successfully': False, 'reason': Errors.incorrect_name_or_password.name})


def delete_user(user):
	user_folder = os.path.join("data", user.lower().replace(" ", "-"))
	if os.path.exists(user_folder):
		shutil.rmtree(user_folder)
		try:
			users.delete(user)
			user_tracks = tracks.find_all(artist=user)
			for i in user_tracks:
				tracks.delete(i)
			return True
		except: None
	return False

@app.route('/api/reset_pwd_html', methods=['GET','POST'])
def reset_pwd_html():
	def get_html():
		args = {'link': ''}
		if 'lang' in request.args.keys():
			args['lang'] = request.args['lang']
		if "url" in request.args.keys():
			args['link'] = request.args['url']

		return htmlTemplates.reset_password(**args)

	html = get_html()
	if 'textMode' in request.args.keys():
		return Response(dedent(html.replace("	", "    ")), mimetype='text/plain')
	else:
		Final_html = '''
			<head><meta name="viewport" content="width=device-width"></head>
			<script>
				function change_lang(lang){
					const args = new URLSearchParams(window.location.search);
					args.set('lang', lang)
					location.search = args.toString()
				}
			</script>
			<a href="javascript:location.search+='&textMode=true'"><button style="font-size:14pt;">Text mode</button></a>
			<div style="float:right;">
				<button onclick="change_lang('en')" style="font-size:14pt;cursor:pointer;">En</button>
				<button onclick="change_lang('ru')" style="font-size:14pt;cursor:pointer;">Ru</button>
			</div>
			<hr>
		'''
		return Final_html + html


@app.route('/emails/<path:filepath>')
@app.route('/emails/<string:lang>/<path:filepath>')
def emails(filepath, lang="auto"):
	def auto_lang():
		lang = request.accept_languages.best_match(['en', 'ru', 'uk'])
		auto_lang = lang if lang else 'en'
		request_path = request.full_path.split('emails/')[-1]
		request_path = auto_lang + "/" + request_path
		return redirect("/emails/" + request_path)

	def get_lang_path(lang):
		full_path = request.base_url
		current_lang = full_path.split("/emails/")[-1].split("/")[0]
		return full_path.replace(f"/{current_lang}/", f"/{lang}/")

	if lang == "auto":
		return auto_lang()

	p = os.path.join("data", "emails", filepath + ".json")
	if os.path.exists(p):
		with open(p, 'r', encoding='utf-8') as file:
			data = json.loads(file.read())
		if not lang in data["langs"].keys():
			return redirect("/emails/en/" + filepath)

		target_file = os.path.join("data", "emails", data['file'])
		with open(target_file, 'r', encoding='utf-8') as f:
			html = f.read()

		for key in data["langs"][lang]:
			html = html.replace("{__" + key + "__}", data["langs"][lang][key])

		for lang_ in data["langs"].keys():
			html = html.replace("{__url:" + lang_ + "__}", get_lang_path(lang_))
			if lang == lang_:
				styles = html.split("<python-url_selected>")[-1].split("</python>")[0]
				html = html.replace('{__url_selected:' + lang_ + "__}", styles)
			else:
				html = html.replace('{__url_selected:' + lang_ + "__}", '')


		if 'raw' in request.args.keys():
			html = html.split("<body>")[-1].split("</body>")[0]
			return Response(dedent(html.replace("	", "    ")), mimetype='text/plain')
		return html
	abort(404)
		
def getTimeRemaining(value):
	lengths = {
		     3_600: ("hour", "hours"),
		    86_400: ("day", "days"),
		 2_678_400: ("month", "months"), # 31 days
		31_536_000: ("year", "years")    # 365 days
	}
	arr = value.split("_")
	for key, val in lengths.items():
		if arr[1] in val:
			return int(arr[0]) * key

def addPremiumToUser(user_, time_add):
	if "premium" in user_ and user_["premium"] != -1:
		user_["premium"] += time_add
	else:
		user_["premium"] = int(time.time()) + time_add

def timeRemainingToStr(value):
	if value == -1: return "unlimited"
	diff = value - int(time.time())
	if diff < 86_400:
		return str(math.ceil(diff / 3_600)) + "hour(s)"
	else: # < 2_678_400
		return str(math.ceil(diff / 86_400)) + "day(s)"

# Admin
@app.route('/api/admin', methods=['POST'])
def is_admin():
	user = users.get(request.json['user'])
	if user:
		if "role" in user.keys() and user['role'] == "admin":
			ip = request.headers.get('X-Forwarded-For', request.remote_addr)
			x = BrootForceProtection(request.json['user'], request.json['password'], ip, fast_login)()
			if x['successfully']:
				if 'command' in request.json.keys():				
					if request.json['command'] == "get_all_users":
						return jsonify({'successfully': True, 'data': list(users.data.keys())})
					elif request.json['command'] == "get_all_tracks":
						return jsonify({'successfully': True, 'data': list(tracks.data)})
					elif request.json['command'] == "open":
						track = tracks.get(tracks.find(artist=request.json['artist'], track=request.json['track']))
						return jsonify({'successfully': True, 'data': track['path']})
					elif request.json['command'] == "get_all_admins":
						admins = users.find_all(role="admin")
						return jsonify({'successfully': True, 'data': admins})
					elif request.json['command'] == "get_all_genres":
						arr = map(lambda x: x['genre'], tracks.data)
						return jsonify({'successfully': True, 'data': sorted(list(set(arr)), key=str.lower)})
					elif request.json['command'] == "get_tracks_by_genre":
						track_ids = tracks.find_all(genre=request.json['genre'])
						arr = list(map(lambda x: tracks.get(x), track_ids))
						return jsonify({'successfully': True, 'data': arr, 'amount': len(arr)})
					elif request.json['command'] == "search_by_email":
						users_arr = users.find_all(email=request.json['email'])
						return jsonify({'successfully': True, 'data': users_arr})
					elif request.json['command'] == "get_user_roles":
						user = users.get(request.json['user_to_get'])
						is_banned(user)
						premium_available(user)
						roles = {}
						if 'role' in user.keys():
							roles['role'] = user['role']
						if 'banned_until' in user.keys():
							roles['banned_until'] = datetime.datetime.fromtimestamp(user['banned_until']).strftime('%d.%m.%Y')
						if 'advantages' in user.keys():
							roles['advantages'] = user['advantages'].copy()
							if 'premium' in user['advantages'].keys():
								roles['advantages']['premium'] = timeRemainingToStr(roles['advantages']['premium'])
						return jsonify({'successfully': True, 'data': roles})
					elif request.json['command'] == "change_role":
						user = users.get(request.json['user_to_change'])
						if request.json['what_change'] == "banned":
							user['role'] = "banned"
							if isinstance(request.json['new_value'], int):
								user['banned_until'] = request.json['new_value']
							else:
								if 'banned_until' in user.keys():
									del user['banned_until']
						else:
							user['role'] = request.json['new_value']
						users.save()
						return jsonify({'successfully': True, 'user': request.json['user_to_change'], 'role': user['role']})
					elif request.json['command'] == "change_advantages":
						user = users.get(request.json['user_to_change'])
						if not 'advantages' in user.keys():
							user['advantages'] = {}
						if request.json['what_change'] == "official":
							if parse_boolean(request.json['new_value']):
								user['advantages'][request.json['what_change']] = parse_boolean(request.json['new_value'])
							else:
								del user['advantages'][request.json['what_change']]
							if "verified_with" in user['advantages'].keys():
								del user['advantages']["verified_with"]
						elif request.json['what_change'] == "premium":
							new_value = None
							if isinstance(request.json['new_value'], int):
								new_value = request.json['new_value']
							elif request.json['new_value'] == "false":
								new_value = 0
							elif request.json['new_value'] == "unlimited":
								new_value = -1
							else:
								try:
									time_remain = getTimeRemaining(request.json['new_value'])
									addPremiumToUser(user['advantages'], time_remain)
								except:
									return jsonify({'successfully': False})
							
							if new_value == 0 and request.json['what_change'] in user['advantages'].keys():
								del user['advantages'][request.json['what_change']]
							else:
								if new_value: user['advantages'][request.json['what_change']] = new_value

						if not len(user['advantages'].keys()) > 0:
							del user['advantages']
						users.save()
						if not 'advantages' in user.keys():
							return jsonify({'successfully': True, 'user': request.json['user_to_change'], '_': {}})
						
						temp_davantages = copy.deepcopy(user['advantages'])
						if 'premium' in user['advantages'].keys():
							temp_davantages['premium'] = timeRemainingToStr(user['advantages']['premium'])
						return jsonify({'successfully': True, 'user': request.json['user_to_change'], '_': temp_davantages})
					elif request.json['command'] == "delete":
						if request.json['type'] == 'track':
							if delete_track_func(request.json['artist'], request.json['track']):
								return jsonify({'successfully': True, 'deleted': True})
							return jsonify({'successfully': False})
						elif request.json['type'] == 'user':
							if request.json['user_to_delete'] == request.json['user']:
								return jsonify({'successfully': False, 'reason': "you_cant_delete_yourself"})
							if delete_user(request.json['user_to_delete']):
								return jsonify({'successfully': True, 'deleted': True})
							return jsonify({'successfully': False})
					elif request.json['command'] == "get_password":
						user = users.get(request.json['user_to_login'])
						return jsonify({'successfully': True, 'password': user['password']})
					elif request.json['command'] == "reset_password":
						user = users.get(request.json['user_to_reset'])
						temp = {'password': user['password']}
						if 'email' in user.keys():
							temp['email'] = user['email']
						return jsonify({'successfully': True, 'user': request.json['user_to_reset'], **temp})

					elif request.json['command'] == "rename_genres":
						if len(request.json['genres']) > 0:
							amount = 0
							for genre in request.json['genres']:
								track_ids = tracks.find_all(genre=genre)
								for track_id in track_ids:
									track = tracks.get(track_id)
									track['genre'] = request.json['new_value']
									amount += 1
							tracks.save()
							return jsonify({'successfully': True, 'renamed': amount})
						return jsonify({'successfully': False})
				return jsonify({'successfully': True})

	return jsonify({'successfully': False, 'reason': "user_not_admin"})


socketio = SocketIO(app, path='/api/messenger/socket.io')

socket_users = {}

@socketio.on('connect')
def handle_connect():
	username = request.cookies.get("userName")
	socket_users[username] = request.sid
	emit('user_online', {"from_user": username}, broadcast=True)

@socketio.on('disconnect')
def handle_disconnect():
	key = list(filter(lambda i: socket_users[i]==request.sid, socket_users))
	if key:
		key = key.pop()
		del socket_users[key]
		emit('user_offline', {"from_user": key}, broadcast=True)



if __name__ == '__main__':
	print("Running...")
	# app.run(debug=True)
	socketio.run(app, host='0.0.0.0', port=80)
