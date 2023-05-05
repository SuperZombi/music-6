main()
function logout(){
	window.localStorage.removeItem("userName")
	window.localStorage.removeItem("userPassword")
	deleteCookie("userName")
	deleteCookie("userPassword")
	goToLogin()
}
function goToLogin(){
	let filename = window.location.pathname;
	if (window.location.search){
		filename += `${window.location.search}`
	}
	if (window.location.hash){
		filename += `>${decodeURI(window.location.hash).substring(1)}`
	}
	let login = new URL("login", window.location.href);
	login.searchParams.append('redirect', filename);
	window.location.href = decodeURIComponent(login.href)
}
function loader(width, height){
	return `
	<svg xmlns="http://www.w3.org/2000/svg" style="display:block;margin:auto;" width="${width}" height="${height}" viewBox="0 0 100 100">
		<circle cx="50" cy="50" fill="none" stroke="#007EFF" stroke-width="10" r="35" stroke-dasharray="165 57">
			<animateTransform attributeName="transform" type="rotate" repeatCount="indefinite" dur="1s" values="0 50 50;360 50 50" keyTimes="0;1"></animateTransform>
		</circle>
	</svg>`
}
function copy(text){
	const elem = document.createElement('textarea');
	elem.value = text
	document.body.appendChild(elem);
	elem.select();
	document.execCommand('copy');
	document.body.removeChild(elem);
}
function main(){
	document.title = LANG.messenger
	
	local_storage = { ...localStorage };
	if (local_storage.userName && local_storage.userPassword){
		if (getCookie("userName") && getCookie("userPassword")){
			notice = new Notifications('#notifications');
			document.querySelector("#notifications").classList.add("notifications_top")
			submain()
		} else{
			logout()
		}
	}
	else{
		goToLogin()
	}
}
function initSettings(){
	let settings = document.querySelector("#settings-popup")

	settings.querySelectorAll("input[type='checkbox']").forEach(input=>{
		input.onchange = _=>{
			localStorage.setItem(input.name, input.checked)
		}
		if (localStorage.getItem(input.name)){
			input.checked = JSON.parse(localStorage.getItem(input.name))
		}
	})

	let lang = window.navigator.language.substr(0, 2).toLowerCase()
	let translation_lang = settings.querySelector("input[type='text'][name='translation-lang']")
	if (localStorage.getItem("translation-lang")){
		translation_lang.value = localStorage.getItem("translation-lang")
		settings.querySelector("input[type='radio'][name='translation-lang'][value='custom']").checked = true
	} else{
		translation_lang.value = lang
	}
	settings.querySelector("input[type='radio'][name='translation-lang'][value='default']").onclick = _=>{
		localStorage.removeItem("translation-lang")
		translation_lang.value = lang
	}
	translation_lang.onchange = _=>{
		settings.querySelector("input[type='radio'][name='translation-lang'][value='custom']").checked = true
		localStorage.setItem("translation-lang", translation_lang.value)
	}

	let userURL = window.location.origin + window.location.pathname + "?new-chat#" + local_storage.userName.replaceAll(" ", "%20")
	let userURL_simple = window.location.hostname + window.location.pathname + "?new-chat#" + local_storage.userName
	document.getElementById("userURL").setAttribute("href", userURL)
	document.getElementById("userURL").innerHTML = userURL_simple.replaceAll("/", "/<wbr>")
														  .replaceAll("?", "?<wbr>")
														  .replaceAll("#", "#<wbr>");

	qrcode.stringToBytes = qrcode.stringToBytesFuncs["UTF-8"];
	var typeNumber = 0; // autodetect
	var errorCorrectionLevel = 'L'; // 'L', 'M', 'Q', 'H'
	var qr = qrcode(typeNumber, errorCorrectionLevel);
	qr.addData(userURL);
	qr.make();

	document.getElementById('qrcode').innerHTML = qr.createSvgTag({
		cellSize: 7,
		margin: 0
	});

	let xhr = new XMLHttpRequest();
	xhr.open("POST", `/api/get_user_profile_public`)
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.onload = function() {
		if (xhr.status == 200){
			let answer = JSON.parse(xhr.response);
			if (answer.successfully){
				if (answer?.public_fields["receive-messages"] == false){
					document.getElementById("receive-messages-denied").classList.remove("hide")
					document.querySelector("#receive-messages-denied > *").innerHTML = LANG.disabled_private_messages
						.replace(/%(.*)%/gm, (match, contents)=>{
							return `<a href="/account/#settings" target="_blank">${contents}</a>`	
						})
				}
			}
		}
	}
	xhr.send(JSON.stringify({
		'user': local_storage.userName
	}))
}
function submain(){
	initSettings()
	initPushNotifications()

	var chats = document.getElementById("chats")
	var messages = document.getElementById("messages")
	var send = document.getElementById("send")
	var scrollBottom = document.getElementById("scroll-bottom")

	var message_input = document.getElementById("message-input")
	message_input.oninput = _=>{
		message_input.style.height = '0';
		if (message_input.value != ""){
			message_input.style.height = message_input.scrollHeight + 'px';
			send.classList.remove("disabled")
		} else{
			send.classList.add("disabled")
		}
	}
	window.onkeydown = e=>{
		if (e.keyCode == 27){
			if (!document.querySelector("#media-fullscreener").classList.contains("hide")){
				document.querySelector("#media-fullscreener").classList.add("hide")
			}
			else if (document.querySelector("#quotes").classList.contains("show")){
				cancelQuote()
			}
			else if (document.querySelector("#settings-popup").classList.contains("show")){
				document.getElementById("settings-popup").classList.remove("show")
			}
			else if (document.querySelector("#new-chat-popup").classList.contains("show")){
				document.getElementById("new-chat-popup").classList.remove("show")
			} else{
				document.querySelector("#back-button").onclick()
				document.querySelector("#chat-body").classList.remove("show")
				messages.innerHTML = ""
			}
		}
		else if (e.keyCode == 13 && !e.shiftKey && window.innerWidth > window.innerHeight){
			if (document.querySelector("#new-chat-popup").classList.contains("show")){
				document.querySelector("#new-chat-popup [role=button]").onclick()
			}
			else if (message_input.value.trim() != ""){
				e.preventDefault();
				send.onclick()
			}
			else if (document.querySelectorAll("#attachments > *").length > 0){
				send.onclick()
			}
		}
	}

	messages.addEventListener("scroll", _=>{
		if (messages.scrollTop + messages.clientHeight + 100 <= messages.scrollHeight){
			scrollBottom.classList.add("show")
		} else{
			scrollBottom.classList.remove("show")
		}
	})
	scrollBottom.onclick = _=>{
		messages.scrollTop = messages.scrollHeight;
	}

	document.getElementById("askNewChat").onclick = _=>{
		document.querySelector("#new-chat-popup input").value = ""
		document.getElementById("new-chat-popup").classList.add("show")
	}
	document.querySelector("#new-chat-popup .close_popup").onclick = _=>{
		document.getElementById("new-chat-popup").classList.remove("show")
	}

	document.getElementById("settings").onclick = _=>{
		document.getElementById("settings-popup").classList.add("show")
	}
	document.querySelector("#settings-popup .close_popup").onclick = _=>{
		document.getElementById("settings-popup").classList.remove("show")
	}

	document.querySelector("#new-chat-popup [role=button]").onclick = _=>{
		let chatName = document.querySelector("#new-chat-popup input").value.trim()
		if (chatName){
			window.location.hash = chatName
			newChat()
		}
	}
	document.getElementById("chats-wrapper").addEventListener("click", event=>{
		let path = event.path || (event.composedPath && event.composedPath());
		if (!path.includes(document.querySelector("#askNewChat"))){
			document.getElementById("new-chat-popup").classList.remove("show")
		}
		if (!path.includes(document.querySelector("#settings"))){
			document.getElementById("settings-popup").classList.remove("show")
		}
		if (!path.filter(y=>y.classList && y.classList.contains("hovered")).length > 0){
			document.querySelectorAll("#messages-container .message.hovered").forEach(e=>{
				e.classList.remove("hovered")
				e.querySelector(".helper-body").classList.remove("show", "topper", "bottomer")
			})
		}
	})

	document.querySelector("#back-button").onclick = _=>{
		chats.classList.add("show")
		window.location.hash = ""
		document.title = LANG.messenger
		chats.querySelectorAll(".active").forEach(e=>{
			e.classList.remove("active")
		})
		const url_ = new URL(window.location);
		if (url_.searchParams.has('new-chat')){
			url_.searchParams.delete('new-chat');
			window.history.pushState(null, '', url_.toString());
		}
		cancelQuote()
	}
	document.querySelector("#clear-chat").onclick = _=>{
		window.navigator.vibrate(100);
		setTimeout(_=>{
			if (confirm(LANG.deleting_chat_confirm)){
				let name = document.querySelector("#chat-info .chat-name").innerHTML
				deleteChat(name)
			}
		}, 50)
	}
	window.addEventListener("hashchange", _=>{
		if (location.hash == ""){
			document.querySelector("#back-button").onclick()
			if (window.innerHeight < window.innerWidth){
				document.querySelector("#chat-body").classList.remove("show")
				messages.innerHTML = ""
			}
		}
	});

	document.querySelector("#quote_message").addEventListener("click", _=>{
		let msg;
		if (document.querySelector("#quotes").getAttribute("edit-mode")){
			msg = document.querySelector("#quote_message").getAttribute("edit-message-id")
		} else{
			msg = document.querySelector("#quote_message").getAttribute("reply-to-message-id")
		}
		focusMessage(msg)
	})

	addFavorites()
	initAtachments()

	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/messenger/get_chats')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.onload = function() {
		if (xhr.status == 200){ 
			let answer = JSON.parse(xhr.response);
			if (answer.successfully){
				answer.chats.forEach(chat=>{
					if (chat.chat_name == local_storage.userName){return}
					addChat(chat.chat_name, chat.chat_image, chat.unread_messages_count, chat.readOnly, chat.online)
				})
				chats.querySelector("#chat_loading").style.display = "none";
				let count = chats.querySelectorAll(".notification-dot:not(.hidden)").length
				if (count > 0){
					document.title = `${LANG.messenger} • (${count})`
				}
				if (window.location.href){
					let openedChat = decodeURI(window.location.hash).substring(1)
					let chatEl = chats.querySelector(`[chat-name="${openedChat}"]`)
					if (chatEl){
						chatEl.onclick()
					}
				}
			}
		}
	}
	xhr.send(JSON.stringify({
		'user': local_storage.userName,
		'password': local_storage.userPassword
	}))

	var socket = io.connect(location.protocol + '//' + document.domain + ':' + location.port, {
		'path': '/api/messenger/socket.io'
	});

	socket.on('new_message', function(msg) {
		let chat_name = msg.from_user == local_storage.userName ? msg.chat : msg.from_user;
		let active_chat = chats.querySelector(".active")
		let target = chats.querySelector(`[chat-name="${chat_name}"]`)
		if (target){
			chats.prepend(target)

			if (active_chat && chat_name == active_chat.getAttribute("chat-name")){
				prepareMessage(msg)
				if (!document.hidden){
					play_notify("quiet")
					markChatAsReaded(active_chat.getAttribute("chat-name"))
				}
				else{
					if (msg.from_user != local_storage.userName){
						pushNotifications(msg.from_user, msg.message, document.querySelector("#chat-info .chat-icon img").src)
					}
				}
			} else{
				if (msg.from_user != local_storage.userName){
					let notif = target.querySelector(".notification-dot")
					if (notif.classList.contains("hidden")){
						notif.classList.remove("hidden")
						notif.innerHTML = "1"
					} else{
						notif.innerHTML = parseInt(notif.innerHTML) + 1
					}
					pushNotifications(msg.from_user, msg.message, target.querySelector(".chat-icon img").src)
				}
			}
		}
		else {
			let unreaded = msg.from_user == local_storage.userName ? 0 : 1
			loadProfileImage(chat_name, url=>{
				let ch = addChat(chat_name, url, unreaded)
				chats.prepend(ch)
				if (msg.from_user != local_storage.userName){
					ch.classList.add("online")
					pushNotifications(msg.from_user, msg.message, url)
				}
				let opened_chat_name = document.querySelector("#chat-info .chat-name").innerHTML
				if (document.querySelector("#chat-body").classList.contains("show") && chat_name == opened_chat_name){
					ch.classList.add("active")
					prepareMessage(msg)
					play_notify("quiet")
				}
				let count = chats.querySelectorAll(".notification-dot:not(.hidden)").length
				if (count > 0){
					document.title = `${LANG.messenger} • (${count})`
				}
			})
		}

		let count = chats.querySelectorAll(".notification-dot:not(.hidden)").length
		if (count > 0){
			document.title = `${LANG.messenger} • (${count})`
		}
	});
	socket.on('delete_message', function(msg) {
		let el = document.querySelector(`.message[message-id='${msg.id}']`)
		if (el){
			el.remove()
		}
		messages.querySelectorAll(`.reply-to-message[message-id='${msg.id}']`).forEach(e=>{
			e.innerHTML = LANG.deleted_message
		})
	});
	socket.on('delete_chat', function(msg) {
		let chat_name = msg.from_user == local_storage.userName ? msg.chat : msg.from_user;
		let active_chat = chats.querySelector(".active")
		if (active_chat && chat_name == active_chat.getAttribute("chat-name")){
			messages.innerHTML = ""
		}
		if (chat_name != local_storage.userName){
			let target = chats.querySelector(`[chat-name="${chat_name}"]`)
			if (target){
				target.remove()
			}
		}
		let count = chats.querySelectorAll(".notification-dot:not(.hidden)").length
		if (count > 0){
			document.title = `${LANG.messenger} • (${count})`
		} else {
			if (active_chat){
				document.title = `${LANG.messenger} • ${active_chat.getAttribute("chat-name")}`
			} else{
				document.title = LANG.messenger
			}
		}
		if (push_notify_allowed){
			getSW(reg=>{
				reg.active.postMessage({
					delete_notification: chat_name
				})
			})
		}
	});
	socket.on('edit_message', function(msg) {
		let old_element = messages.querySelector(`.message[message-id="${msg.id}"]`)
		if (old_element){
			let date = new Date(msg.time * 1000)
			let time = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0")
			msg.time = time

			let new_message = buildMessage(msg)
			old_element.replaceWith(new_message)		
		}
	});
	socket.on('chat_readed', function(msg) {
		let active_chat = chats.querySelector(".active")
		if (active_chat && msg.from_user == active_chat.getAttribute("chat-name")){
			messages.querySelectorAll(".message.not-readed").forEach(e=>{
				e.classList.remove("not-readed")
			})
		}
		if (msg.from_user == local_storage.userName){
			if (push_notify_allowed){
				getSW(reg=>{
					reg.active.postMessage({
						delete_notification: msg.chat
					})
				})
			}

			let target = chats.querySelector(`[chat-name="${msg.chat}"]`)
			if (target){
				let notif = target.querySelector(".notification-dot")
				notif.innerHTML = ""
				notif.classList.add("hidden")
			}
			let count = chats.querySelectorAll(".notification-dot:not(.hidden)").length
			if (active_chat){
				document.title = `${LANG.messenger} • ${active_chat.getAttribute("chat-name")}`
			} else{
				document.title = LANG.messenger
			}
		}
	});
	socket.on('user_online', function(msg) {
		if (msg.from_user != local_storage.userName){
			let chat = chats.querySelector(`[chat-name="${msg.from_user}"]`)
			if (chat){
				chat.classList.add("online")
				let active_chat = chats.querySelector(".active")
				if (active_chat && msg.from_user == active_chat.getAttribute("chat-name")){
					document.querySelector("#chat-info .chat-icon").classList.add("online")
				}
			}
		}
	});
	socket.on('user_offline', function(msg) {
		if (msg.from_user != local_storage.userName){
			let chat = chats.querySelector(`[chat-name="${msg.from_user}"]`)
			if (chat){
				chat.classList.remove("online")
				let active_chat = chats.querySelector(".active")
				if (active_chat && msg.from_user == active_chat.getAttribute("chat-name")){
					document.querySelector("#chat-info .chat-icon").classList.remove("online")
				}
			}
		}
	});
	window.addEventListener('blur', _=> {
		socket.emit("change_status", "offline");
	});
	window.addEventListener('focus', _=> {
		socket.emit("change_status", "online");
		let active_chat = chats.querySelector(".active")
		if (active_chat){
			markChatAsReaded(active_chat.getAttribute("chat-name"))
		}
	});

	send.onclick = _=>{
		if (send.classList.contains("disabled")){return}
		let attachments = document.querySelectorAll("#attachments > *")
		if (attachments.length > 0){
			let imgs = document.querySelectorAll("#attachments .attachment > img")
			imgs.forEach(img=>{
				message_input.value += img.outerHTML
			})
		}
		if (message_input.value.trim() == ""){return}
		send.classList.add("disabled")
		message_input.readOnly = true;

		let data = {
			'user': local_storage.userName,
			'password': local_storage.userPassword,
			"chat": decodeURI(window.location.hash).substring(1),
			"message": message_input.value.trim()
		}

		if (document.querySelector("#quote_message").innerHTML != ""){
			if (document.querySelector("#quotes").getAttribute("edit-mode")){
				msg_id = document.querySelector("#quote_message").getAttribute("edit-message-id")
				data = {...data, "edit_message": msg_id}
			} else{
				msg_id = document.querySelector("#quote_message").getAttribute("reply-to-message-id")
				data = {...data, "reply_to_message": msg_id}
			}
		}

		let xhr = new XMLHttpRequest();
		xhr.open("POST", '/api/messenger/send_message')
		xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
		xhr.onload = function() {
			message_input.readOnly = false;
			send.classList.remove("disabled")
			if (xhr.status == 200){ 
				let answer = JSON.parse(xhr.response);
				if (answer.successfully){
					message_input.value = ""
					message_input.oninput()
					send.classList.add("disabled")
					document.querySelector("#attachments").innerHTML = ""
					document.querySelector("#chat-info .chat-icon").classList.remove("online")
					cancelQuote()
					return
				}
			}
			notice.Error(LANG.failed_send_message)
		}
		xhr.send(JSON.stringify(data))
	}

	let search = new URLSearchParams(window.location.search)
	if (search.has("new-chat")){
		newChat()
	}
}

async function getSW(callback){
	let reg = await navigator.serviceWorker.getRegistration('/root_/scripts/service-worker.js');
	await reg.update()
	callback(reg)
}
var push_notify_allowed = false;
function initPushNotifications(){
	Notification.requestPermission().then(perm=>{
		if (perm === "denied"){
			console.error("Notifications denied")
		}
		else if (perm == "granted"){
			push_notify_allowed = true;
			document.querySelector("#settings-popup #push_notify_disabled").classList.add("hide")
			navigator.serviceWorker.register('/root_/scripts/service-worker.js').then(
				registration=>{
					if (registration) {
						registration.update();
					}
				},
				error=>{
					console.error('ServiceWorker registration failed', error);
				}
			);

			navigator.serviceWorker.addEventListener('message', function(event) {
				if (event.data) {
					if (event.data.open_chat){
						let target = chats.querySelector(`[chat-name="${event.data.open_chat}"]`)
						if (target){
							target.onclick()
							window.parent.parent.focus();
						}
					}
				}
			});
		}
	})
}

const notification_audios = {
	"default": new Audio('/root_/audio/notification.mp3'),
	"quiet": new Audio('/root_/audio/notify_quiet.mp3')
}
function play_notify(name){
	if (document.querySelector("#settings-popup input[name='notification-sounds']").checked){
		notification_audios[name].play();
	}
}
async function pushNotifications(from_user, message, icon){
	play_notify("default")

	if (push_notify_allowed){
		getSW(reg=>{
			message = message.length > 100 ? message.slice(0, 100) + "..." : message
			reg.showNotification(from_user, {
				body: message,
				icon: icon,
				tag: from_user,
				renotify: true
			});
		})	
	}
}

function markChatAsReaded(chatName){
	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/messenger/mark_chat_as_readed')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.send(JSON.stringify({
		'user': local_storage.userName,
		'password': local_storage.userPassword,
		'chat': chatName
	}))
}

function newChat(){
	let chatName = decodeURI(window.location.hash).substring(1);
	let chatEl = chats.querySelector(`[chat-name="${chatName}"]`)
	if (chatEl){
		chatEl.onclick();
		document.getElementById("new-chat-popup").classList.remove("show")
		return
	}
	document.getElementById("chat-body").classList.add("show")
	chats.querySelectorAll(".active").forEach(e=>{
		e.classList.remove("active")
	})
	chats.classList.remove("show")
	
	let name = document.querySelector("#chat-info .chat-name")
	let img_ = document.querySelector("#chat-info .chat-icon img")
	let url = document.querySelector("#chat-info .url")
	name.innerHTML = chatName
	url.href = decodeURI(new URL("/" + chatName.toLocaleLowerCase().replaceAll(" ", "-"), window.location.href).href)

	loadProfileImage(chatName, url=>{
		img_.src = url
		document.title = `${LANG.messenger} • ${chatName}`
		document.getElementById("new-chat-popup").classList.remove("show")
		messages.innerHTML = ""
		document.querySelector("#attachments").innerHTML = ""
		document.querySelector("#chat-info .chat-icon").classList.remove("online")
	}, error=>{
		document.getElementById("chat-body").classList.remove("show")
		chats.classList.add("show")
		notice.Error(LANG.user_not_found)

		window.location.hash = ""
		const url_ = new URL(window.location);
		url_.searchParams.delete('new-chat');
		window.history.pushState(null, '', url_.toString());
	})
}
function loadProfileImage(userName, callback, error){
	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/get_profile_photo')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.onload = function() {
		if (xhr.status == 200){ 
			let answer = JSON.parse(xhr.response);
			if (answer.successfully){
				let link = new URL(answer.image)
				return callback(link.href)
			} else{
				if (answer.reason == 'user_dont_exist'){
					return error()
				}
			}
		}
	}
	xhr.send(JSON.stringify({'artist': userName}))
}

function addFavorites(){
	let div = addChat(local_storage.userName)
	div.querySelector(".chat-name").innerHTML = LANG.saved_messages
	div.style.order = -1;
	loadProfileImage(local_storage.userName, url=>{
		div.querySelector(".chat-icon img").src = url
	})
}

function addChat(chatName, chatImage="", unread_messages=0, readOnly=false, online=false){
	let div = document.createElement("div")
	div.className = "chat"
	div.setAttribute("chat-name", chatName)
	if (chatName != local_storage.userName){
		online ? div.classList.add("online") : null
	}
	let chat_name = document.createElement("div")
	chat_name.className = "chat-name"
	chat_name.innerHTML = chatName
	let chat_img = document.createElement("div")
	chat_img.className = "chat-icon"
	let img = document.createElement("img")
	img.src = chatImage
	chat_img.appendChild(img)
	let notification = document.createElement("div")
	notification.className = "notification-dot hidden"
	if (unread_messages > 0){
		notification.innerHTML = unread_messages
		notification.classList.remove("hidden")
	}

	div.appendChild(chat_img)
	div.appendChild(chat_img)
	div.appendChild(chat_name)
	div.appendChild(notification)
	div.onclick = _=>{
		if (readOnly){
			document.querySelector(".chat-input").classList.add("readonly")
		} else{
			document.querySelector(".chat-input").classList.remove("readonly")
		}
		document.querySelector("#message-input").value = ""
		document.querySelector("#attachments").innerHTML = ""
		cancelQuote()
		document.getElementById("chat-body").classList.add("show")
		document.querySelector("#chat-info .chat-icon").classList.remove("online")
		chats.querySelectorAll(".active").forEach(e=>{
			e.classList.remove("active")
		})
		div.classList.add("active")
		chats.classList.remove("show")
		
		let name = document.querySelector("#chat-info .chat-name")
		let img_ = document.querySelector("#chat-info .chat-icon img")
		let url = document.querySelector("#chat-info .url")
		name.innerHTML = chatName
		img_.src = img.src
		if (chatName == local_storage.userName){
			url.href = new URL("/account/", window.location.href).href
		} else{
			url.href = decodeURI(new URL("/" + chatName.toLocaleLowerCase().replaceAll(" ", "-"), window.location.href).href)
		}
		div.classList.contains("online") ? document.querySelector("#chat-info .chat-icon").classList.add("online") : null;

		window.location.hash = chatName
		document.title = `${LANG.messenger} • ${chatName}`
		loadChat(chatName)
		notification.classList.add("hidden")
		notification.innerHTML = ""
	}
	chats.appendChild(div)
	return div
}
function loadChat(chatName){
	messages.innerHTML = loader("80px", "100%")

	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/messenger/get_messages')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.onload = function() {
		if (xhr.status == 200){ 
			let answer = JSON.parse(xhr.response);
			if (answer.successfully){
				buildMessages(answer.messages)
			}
		}
	}
	xhr.send(JSON.stringify({
		'user': local_storage.userName,
		'password': local_storage.userPassword,
		'chat': chatName
	}))
}

function addInfoMessage(date, timestamp){
	let msg = document.createElement("div")
	msg.className = "message info time"
	msg.setAttribute("unix", timestamp)
	msg.innerHTML = `
		<div class="message-body">
			${date}
		</div>
	`
	messages.appendChild(msg)
}
function getTextNodes(element){
	let nodes = []
	if (element.hasChildNodes()){
		element.childNodes.forEach(node=>{
			if(node.nodeType === 3){
				if (node.textContent.trim() != ""){
					nodes.push(node)
				}
			} else{
				nodes.push(...getTextNodes(node))
			}
		})
	}
	return nodes
}
function addInfoNewMessages(){
	let msg = document.createElement("div")
	msg.className = "message info new"
	msg.innerHTML = `
		<div class="message-body">
			${LANG.new_messages}
		</div>
	`
	messages.appendChild(msg)
}
function buildMessage(message){
	let msg = document.createElement('div')
	msg.className = "message"
	msg.setAttribute("message-id", message.id)
	msg.classList.add(message.from_user == local_storage.userName ? "from-me": "from-other")
	if (message.is_read != null && message.from_user == local_storage.userName){
		message.is_read ? null : msg.classList.add("not-readed")
	}

	// ${message.from_user == local_storage.userName ? "": `<div class="user">${message.from_user}</div>`}
	msg.innerHTML = `
		<div class="message-body">

			${message.reply_to_message ?
				`<div class="reply-to-message" message-id="${message.reply_to_message}">
					${message.reply_to_message_text ? message.reply_to_message_text : LANG.deleted_message}
				</div>` : ""
			}
			<div class="tail">
				<div class="text"></div>
				<time>${message.time}</time>
			</div>
		</div>

		<div class="helper">
			<i class="fa fa-ellipsis"></i>
			<div class="helper-body">
				${document.querySelector(".chat-input").classList.contains("readonly") ? "" : `
					<div action="reply" style="order: -1">
						<span class="icon"><i class="fa-solid fa-reply"></i></span>
						<span class="caption">${LANG.reply}</span>
					</div>
				`}
				<div action="delete" style="order: 2">
					<span class="icon"><i class="fa-solid fa-trash"></i></span>
					<span class="caption">${LANG.delete}</span>
				</div>
			</div>
		</div>
	`
	function embedYoutube(text){
		var el = document.createElement( 'html' );
		el.innerHTML = text
		el.querySelectorAll("a").forEach(e=>{
			let reg = [...e.href.matchAll(/http(?:s?):\/\/(?:www\.)?youtu(?:be\.com\/watch\?v=|\.be\/|be\.com\/shorts\/)([\w\-\_]*)?/gm)]
			if (reg.length > 0){
				let vid_id = reg[0][1]
				let iframe = document.createElement("iframe")
				iframe.src = `https://www.youtube.com/embed/${vid_id}`
				iframe.setAttribute("frameborder", 0)
				iframe.setAttribute("allowfullscreen", true)
				e.after(iframe)
				e.remove()
			}
		})
		return el.innerHTML
	}
	function from_embed_to_link(element){
		let temp_element = document.createElement("div")
		temp_element.innerHTML = element.innerHTML
		temp_element.querySelectorAll("iframe").forEach(e=>{
			if (e.src.startsWith("https://www.youtube.com/embed/")){
				let reg = e.src.split(/https:\/\/www\.youtube\.com\/embed\/(.*)/gm).filter(x=>x)[0]
				e.after(`https://www.youtube.com/watch?v=${reg}`)
				e.remove()
			}
		})
		return temp_element.innerText
	}
	msg.querySelector(".text").innerHTML = embedYoutube(marked.parseInline(message.message))
	msg.querySelector(".helper").onclick = _=>{
		window.navigator.vibrate(50);
		msg.querySelector(".helper-body").classList.remove("topper", "bottomer")
		msg.querySelector(".helper-body").classList.toggle("show")
		msg.classList.toggle("hovered")
		setTimeout(_=>{
			let parrent = messages.getBoundingClientRect()
			let target = msg.querySelector(".helper-body").getBoundingClientRect()
			if (parrent.top > target.top){
				msg.querySelector(".helper-body").classList.add("topper")
			}
			else if (parrent.bottom < target.bottom){
				msg.querySelector(".helper-body").classList.add("bottomer")
			}
			
			if (parrent.left > target.left || parrent.right < target.right){
				msg.querySelector(".helper-body").classList.add("hide-caption")
			}
		}, 500)
	}
	msg.querySelectorAll(".text img").forEach(img=>{
		img.onclick =_=>{
			openImageFullScreen(img)
		}
	})

	let replyer = msg.querySelector('[action="reply"]')
	if (replyer){
		replyer.onclick = _=>{
			cancelQuote()
			document.querySelector("#quotes").classList.add("show")
			document.querySelector("#quote_message").setAttribute("reply-to-message-id", message.id)
			document.querySelector("#quote_message").innerHTML = msg.querySelector(".text").innerHTML
			document.querySelector("#message-input").focus()
		}
		msg.ondblclick = e=>{
			if(document.selection && document.selection.empty) {
				document.selection.empty();
			} else if(window.getSelection) {
				var sel = window.getSelection();
				sel.removeAllRanges();
			}

			msg.querySelector('[action="reply"]').onclick()
		}
	}
	msg.querySelector('[action="delete"]').onclick = _=>{
		window.navigator.vibrate(100);
		setTimeout(_=>{
			if (confirm(LANG.delete_message)){
				let xhr = new XMLHttpRequest();
				xhr.open("POST", '/api/messenger/delete_message')
				xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
				xhr.onload = function() {
					if (xhr.status == 200){ 
						let answer = JSON.parse(xhr.response);
						if (answer.successfully){
							msg.remove()
						}
					}
				}
				xhr.send(JSON.stringify({
					'user': local_storage.userName,
					'password': local_storage.userPassword,
					"message_id": msg.getAttribute("message-id")
				}))
			}
		}, 50)
	}

	let textNodes = getTextNodes(msg.querySelector(".text"))
	let iframes = [...msg.querySelectorAll(".text iframe")].filter(x=>x.src.startsWith("https://www.youtube.com/embed/"))

	if (textNodes.length > 0 || iframes.length > 0){
		let copier = document.createElement("div")
		copier.setAttribute("action", "copy")
		copier.innerHTML = `
			<span class="icon"><i class="fa-solid fa-copy"></i></span>
			<span class="caption">${LANG.copy}</span>
		`
		copier.onclick = _=>{
			let text = from_embed_to_link(msg.querySelector(".text"))
			copy(text)
		}
		msg.querySelector(".helper .helper-body").prepend(copier)

		if (message.from_user == local_storage.userName){
			let editor = document.createElement("div")
			editor.setAttribute("action", "edit")
			editor.innerHTML = `
				<span class="icon"><i class="fa-solid fa-pen"></i></span>
				<span class="caption">${LANG.edit}</span>
			`
			editor.onclick = _=>{
				document.querySelector("#message-input").value = message.message
				document.querySelector("#quotes").classList.add("show")
				document.querySelector("#quotes").setAttribute("edit-mode", true)
				document.querySelector("#quote_message").setAttribute("edit-message-id", message.id)
				document.querySelector("#quote_message").innerHTML = msg.querySelector(".text").innerHTML
				document.querySelector("#message-input").focus()
			}
			msg.querySelector(".helper .helper-body").prepend(editor)
		}

		if (textNodes.length > 0 && document.querySelector("input[name='translate-messages']").checked){
			let translator = document.createElement("div")
			translator.style.order = "2";
			translator.setAttribute("action", "translate")
			translator.innerHTML = `
				<span class="icon"><i class="fa-solid fa-language"></i></span>
			 	<span class="caption">${LANG.translate}</span>
			`
			translator.onclick = _=>{
				textNodes.forEach(node=>{
					let lang = 	document.querySelector("#settings-popup input[type='text'][name='translation-lang']").value
					translate(node.textContent, lang, res=>{
						node.textContent = res + "\n"
					})
				})
				setTimeout(_=>{
					translator.remove()
				}, 500)
			}
			msg.querySelector(".helper .helper-body").prepend(translator)		
		}
	}

	if (message.reply_to_message){
		msg.querySelector(".reply-to-message").onclick = _=>{
			focusMessage(message.reply_to_message)
		}	
	}

	return msg
}
function addMessage(message){
	let scrollAfter = false;
	if (messages.scrollTop + messages.clientHeight + 10 >= messages.scrollHeight || message.from_user == local_storage.userName){
		scrollAfter = true;
	}

	let msg = buildMessage(message)
	messages.appendChild(msg)
	if (scrollAfter){
		messages.scrollTop = messages.scrollHeight;
	}
}

function cancelQuote(){
	document.querySelector("#quotes").classList.remove("show")
	document.querySelector("#quote_message").removeAttribute("reply-to-message-id")
	document.querySelector("#quote_message").innerHTML = ""
	if (document.querySelector("#quotes").getAttribute("edit-mode")){
		document.querySelector("#quotes").removeAttribute("edit-mode")
		document.querySelector("#message-input").value = ""
	}
}
function focusMessage(id){
	let el = messages.querySelector(`.message[message-id="${id}"]`)
	el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
	el.classList.add("highlight")
	setTimeout(_=>{
		el.classList.remove("highlight")
	}, 500)
}

function prepareMessage(msg){
	let date = new Date(msg.time * 1000)

	let last_date = [...messages.querySelectorAll(".info.time")].at(-1)
	if (last_date){
		last_date = new Date(last_date.getAttribute("unix") * 1000);
		let day_last = last_date.getDate().toString().padStart(2, "0");
		let month_last = (last_date.getMonth() + 1).toString().padStart(2, "0");
		last_date = `${day_last}.${month_last}`

		let day = date.getDate().toString().padStart(2, "0");
		let month = (date.getMonth() + 1).toString().padStart(2, "0");
		let new_date = `${day}.${month}`

		if (last_date != new_date){
			addInfoMessage(new_date, msg.time)
		}
	}

	let time = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0")
	msg.time = time
	addMessage(msg)
}
function buildMessages(array){
	messages.classList.remove("smooth")
	messages.innerHTML = ""
	last_date = ""
	let current_year = new Date().getFullYear();
	let new_messages_showed = false;
	array.forEach(msg=>{
		if (!msg.is_read && msg.from_user != local_storage.userName && !new_messages_showed){
			addInfoNewMessages()
			new_messages_showed = true;
		}
		let date = new Date(msg.time * 1000)
		let day = date.getDate().toString().padStart(2, "0");
		let month = (date.getMonth() + 1).toString().padStart(2, "0");

		let new_date;
		if (current_year == date.getFullYear()){
			new_date = `${day}.${month}`
		} else{
			new_date = `${day}.${month}.${date.getFullYear()}`
		}
		if (last_date != new_date){
			addInfoMessage(new_date, msg.time)
			last_date = new_date
		}
		let time = date.getHours().toString().padStart(2, "0") + ":" + date.getMinutes().toString().padStart(2, "0")
		msg.time = time
		addMessage(msg)
	})

	setTimeout(_=>{
		if (new_messages_showed){
			messages.querySelector(".info.new").scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
		} else{
			messages.scrollTop = messages.scrollHeight;
		}
		messages.classList.add("smooth")
	}, 10)
}


function deleteChat(chatName){
	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/messenger/delete_chat')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.send(JSON.stringify({
		'user': local_storage.userName,
		'password': local_storage.userPassword,
		"chat": chatName
	}))
}


function initAtachments(){
	var MAX_FILES_COUNT = 6
	document.querySelector("#add-attachment").onclick = _=>{
		if (document.querySelectorAll("#attachments > *").length >= MAX_FILES_COUNT){
			notice.Error(LANG.max_files_count)
			return
		}
		let input = document.createElement('input');
		input.type = 'file';
		input.accept = "image/*";
		input.multiple = true;
		input.onchange = async e => {
			let current = document.querySelectorAll("#attachments > *").length
			if (current + e.target.files.length > MAX_FILES_COUNT){
				notice.Error(LANG.max_files_count)
			}
			for (let i=0, j=current; j<MAX_FILES_COUNT; i++, j++){
				addFileToAttachments(e.target.files[i])
			}
		}
		input.click();
	}
	var dragTimer;
	['dragenter', 'dragover'].forEach(eventName => {
		document.querySelector(".chat-input").addEventListener(eventName, e=>{
			let dt = e.dataTransfer;
			if (dt.types && (dt.types.indexOf ? dt.types.indexOf('Files') != -1 : dt.types.contains('Files'))) {
				document.querySelector("#attachments").classList.add("drag")
				clearTimeout(dragTimer);
			}
			e.preventDefault()
			e.stopPropagation()
		})
	})
	document.querySelector(".chat-input").addEventListener("dragleave", e=>{
		dragTimer = setTimeout(function() {
			document.querySelector("#attachments").classList.remove("drag")
		}, 25);
		e.preventDefault()
		e.stopPropagation()
	})
	document.querySelector(".chat-input").addEventListener("drop", e=>{
		let dt = e.dataTransfer
		let files = dt.files
		document.querySelector("#attachments").classList.remove("drag")
		let current = document.querySelectorAll("#attachments > *").length
		if (current + files.length > MAX_FILES_COUNT){
			notice.Error(LANG.max_files_count)
		}
		for (let i=0, j=current; j<MAX_FILES_COUNT; i++, j++){
			addFileToAttachments(files[i])
		}
		e.preventDefault()
		e.stopPropagation()
	})

	document.onpaste = function(event){
		var items = (event.clipboardData || event.originalEvent.clipboardData).items;
		for (let index in items) {
			var item = items[index];
			if (item.kind === 'file') {
				var blob = item.getAsFile();
				let current = document.querySelectorAll("#attachments > *").length
				if (current >= MAX_FILES_COUNT){
					notice.Error(LANG.max_files_count); return;
				} else {
					addFileToAttachments(blob)
				}
			}
		}
	}
}
function addFileToAttachments(file){
	if (file && file['type'].split('/')[0] === 'image'){
		var _URL = window.URL || window.webkitURL;
		var img = new Image();
		var objectUrl = _URL.createObjectURL(file);
		img.onload = function () {
			var onSuccessResize = (image)=>{
				toBase64(image, result=>{
					if (result){
						document.getElementById("message-input").value = ""
						send.classList.remove("disabled")
						let imgel = document.createElement("img")
						imgel.src = result
						
						let div = document.createElement("div")
						div.className = "attachment"
						let close = document.createElement("div")
						close.className = "remove"
						close.innerHTML = '<i class="fa-solid fa-circle-xmark"></i>'
						close.onclick = _=>{
							div.remove()
							if (document.querySelectorAll("#attachments > *").length == 0){
								send.classList.add("disabled")
							}
						}
						div.appendChild(imgel)
						div.appendChild(close)
						document.querySelector("#attachments").appendChild(div)
					}
				})
			}
			ResizeRequest(file, onSuccessResize, ...resizeWithRatio(this.width, this.height, 720, 720));
		}
		img.src = objectUrl;
	}
}
function ResizeRequest(file, callback, desired_W=1280, desired_H=1280){
	if (file.type.split('/')[0] == 'image'){
		var new_name = file.name.split('.').slice(0, -1).join() + ".jpg"
		var onSuccess = function (newImage){
			fetch(newImage).then(res => res.blob()).then(resizedImage => {
				var file = new File([resizedImage], new_name, {type: 'image/jpeg'});
				callback(file)
			})
		};

		var reader = new FileReader();
		reader.onload = function (readerEvent) {
			let image_src = readerEvent.target.result;
			resizeImage(image_src, desired_W, desired_H, 0.9, onSuccess)
		}
		reader.readAsDataURL(file);
	}
}
function resizeImage(imageUrl, newWidth, newHeight, quality, onReady, onError) {
    var image = document.createElement('img');
    image.onload = function() {
        var canvas = document.createElement('canvas');
        canvas.width = newWidth;
        canvas.height = newHeight;
        var context = canvas.getContext('2d');
        context.drawImage(image, 0, 0, newWidth, newHeight);
        try {
            // quality (from 0 to 1.0)
            var dataUrl = canvas.toDataURL('image/jpeg', quality);
            onReady(dataUrl);
        } catch (e) {
            if (onError) {
                onError('Image saving error.');
            }
        }
    };
    image.onerror = function() {
        if (onError) {
            onError('Image loading error.');
        }
    };
    image.src = imageUrl;
}
function resizeWithRatio(width, height, max_W, max_H){
    if (width > height) {
        if (width > max_W) {
            height *= max_W / width;
            width = max_W;
        }
    } else {
        if (height > max_H) {
            width *= max_H / height;
            height = max_H;
        }
    }
    return [parseInt(width), parseInt(height)];
}
function toBase64(file, callback) {
	var reader = new FileReader();
	reader.readAsDataURL(file);
	reader.onload = function () {
		callback(reader.result);
	};
	reader.onerror = function (error) {
		console.error(error);
		callback('');
	};
}

function openImageFullScreen(img){
	document.querySelector("#media-fullscreener img").src = img.src
	document.querySelector("#media-fullscreener").classList.remove("hide")

	document.querySelector("#media-fullscreener .previous").disabled = false
	document.querySelector("#media-fullscreener .previous").onclick = _=>{}
	document.querySelector("#media-fullscreener .next").disabled = false
	document.querySelector("#media-fullscreener .next").onclick = _=>{}

	let all_imgs = [...messages.querySelectorAll(".message .tail img")]
	let cur_index = all_imgs.indexOf(img)
	if (cur_index > 0){
		document.querySelector("#media-fullscreener .previous").onclick = _=>{
			setTimeout(_=>{
				openImageFullScreen(all_imgs[cur_index - 1])
			}, 0)
		}
	} else{
		document.querySelector("#media-fullscreener .previous").disabled = true
	}
	if (cur_index < all_imgs.length - 1){
		document.querySelector("#media-fullscreener .next").onclick = _=>{
			setTimeout(_=>{
				openImageFullScreen(all_imgs[cur_index + 1])
			}, 0)
		}
	} else{
		document.querySelector("#media-fullscreener .next").disabled = true
	}
}
function closeFullScreener(){
	document.querySelector("#media-fullscreener").classList.add("hide")
}
document.querySelector("#media-fullscreener").onclick = event=>{
	let path = event.path || (event.composedPath && event.composedPath());
	if (path.includes(document.querySelector("#media-fullscreener img"))){return}
	if (path.includes(document.querySelector("#media-fullscreener .previous"))){return}
	if (path.includes(document.querySelector("#media-fullscreener .next"))){return}
	else{
		closeFullScreener()
	}
}
var fullscreener_x, fullscreener_y;
var canVibrateOnFullScreener;
document.querySelector("#media-fullscreener img").addEventListener("touchstart", e=>{
	fullscreener_x = e.touches[0].clientX
	fullscreener_y = e.touches[0].clientY
	canVibrateOnFullScreener = true;
})
document.querySelector("#media-fullscreener img").addEventListener("touchmove", e=>{
	let target_x = Math.floor(fullscreener_x - e.touches[0].clientX) * (-1)
	let target_y = Math.floor(fullscreener_y - e.touches[0].clientY) * (-1)
	if (Math.abs(target_x) > 25 && Math.abs(target_y) < 50){
		target_y = 0
	}
	if (Math.abs(target_y) > window.innerHeight / 5){
		if (canVibrateOnFullScreener){
			canVibrateOnFullScreener = false;
			window.navigator.vibrate(30);
		}
	} else{
		canVibrateOnFullScreener = true;
	}
	let scale_diff = window.innerHeight / 3;
	let one_percent = scale_diff / 75;
	let transparenting = Math.floor(75 - (Math.abs(target_y) / one_percent))

	transparenting = Math.max(10, transparenting) / 100
	let scale = Math.max(0.85, transparenting + 0.25)

	document.querySelector("#media-fullscreener img").style.transform = `translate(-50%, -50%) translateX(${target_x}px) translateY(${target_y}px) scale(${scale})`
	document.querySelector("#media-fullscreener").style.background = `rgb(0, 0, 0, ${transparenting})`
})
document.querySelector("#media-fullscreener img").addEventListener("touchend", e=>{
	document.querySelector("#media-fullscreener img").style.transition = "0.5s"
	document.querySelector("#media-fullscreener").style.transition = "0.5s"
	document.querySelector("#media-fullscreener img").style.transform = 'translate(-50%, -50%)'
	document.querySelector("#media-fullscreener").style.background = 'rgb(0, 0, 0, 0.75)'
	let diff_x = fullscreener_x - e.changedTouches[0].clientX
	let diff_y = Math.abs(fullscreener_y - e.changedTouches[0].clientY)
	if (diff_y > window.innerHeight / 5){
		closeFullScreener()
	}
	else if (diff_x > 100){
		if (!document.querySelector("#media-fullscreener .next").disabled){
			document.querySelector("#media-fullscreener img").style.transition = ""
			document.querySelector("#media-fullscreener .next").onclick()
		}
	}
	else if (diff_x < -100){
		if (!document.querySelector("#media-fullscreener .previous").disabled){
			document.querySelector("#media-fullscreener img").style.transition = ""
			document.querySelector("#media-fullscreener .previous").onclick()
		}
	}
	setTimeout(_=>{
		document.querySelector("#media-fullscreener img").style.transition = ""
		document.querySelector("#media-fullscreener").style.transition = ""
	}, 500)
})

let qrcodeTimeout, qrcode2_timeout, qrcode3_timeout;
document.querySelector("#qrcode").addEventListener("touchmove", e=>{
	let rect = e.target.getBoundingClientRect();
	let x = Math.max(0, Math.min(rect.width, e.targetTouches[0].pageX - rect.left))
	let y = Math.max(0, Math.min(rect.height, e.targetTouches[0].pageY - rect.top))
	e.offsetX = Math.floor(x)
	e.offsetY = Math.floor(y)
	qrcode_interaction(e)
})
document.querySelector("#qrcode").addEventListener("mousemove", e=>{
	if (e.buttons == 1){
		qrcode_interaction(e)
	}
})
document.querySelector("#qrcode").addEventListener("click", qrcode_interaction)

function qrcode_interaction(e){
	if (qrcodeTimeout){clearTimeout(qrcodeTimeout)}
	if (qrcode2_timeout){clearTimeout(qrcode2_timeout)}
	if (qrcode3_timeout){clearTimeout(qrcode3_timeout)}
	let box = document.querySelector("#qrcode");
	let width = box.offsetWidth;
	let height = box.offsetHeight;
	let x = e.offsetX / (width/2)
	x = Math.round((x - 1)*100)/100
	let y = e.offsetY / (height/2)
	y = Math.round((y - 1)*100)/100
	let deg_x = Math.abs(x) * 20
	let deg_y = Math.abs(y) * 20
	let deg = Math.round(Math.max(deg_x, deg_y))
	box.style.animation = "none"
	box.style.transition = '0s'
	box.style.transform = `perspective(900px) rotate3d(${y * (-1)}, ${x}, 0, ${deg}deg)`
	qrcodeTimeout = setTimeout(_=>{
		box.style.transition = ''
		box.style.transform = 'perspective(900px) rotate3d(0, 0, 0, 0deg)'
		qrcode2_timeout = setTimeout(_=>{
			box.style.transition = '1.5s'
			box.style.transform = 'perspective(900px) rotate3d(1, 0, 0, 6deg)'
			qrcode3_timeout = setTimeout(_=>{
				box.style.animation = ""
			}, 1500)
		}, 500)
	}, 100)
}

function fullScreen_change(target){
	let all_imgs = [...messages.querySelectorAll(".message img")]
	let cur_index = all_imgs.indexOf(current_image)
	let new_img;
	if (target == "previous"){
		new_img = all_imgs[cur_index - 1]
	}
	else if (target == "next"){
		new_img = all_imgs[cur_index + 1]
	}
	if (new_img){
		setTimeout(_=>{
			openImageFullScreen(new_img)
		}, 0)
	}
}

function translate(text, target, callback) {
	let sl = "auto"
	let tl = target
	let encodedText = encodeURI(text)
	let translateUrl = "https://translate.googleapis.com/translate_a/single?client=gtx&sl=" + sl + "&tl=" + tl + "&dt=t&q=" + encodedText;
	let xhr = new XMLHttpRequest();
	xhr.open("GET", translateUrl);
	xhr.onload = function() {
		if (xhr.status == 200){
			let result = JSON.parse(xhr.response)[0];
			let answer = result.map(e=>{return e[0]}).join("")
			callback(answer)
		}
	}
	xhr.send();
}
