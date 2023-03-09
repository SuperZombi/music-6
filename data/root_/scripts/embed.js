main()

function checkRoundPage(params){
	if (params.round){
		if (params.round === 'true'){
			document.getElementById("page").style.borderRadius = "30px"
		}
	}
}

function main(){
	document.title = `${config.artist} - ${config.track_name}`
	const urlSearchParams = new URLSearchParams(window.location.search);
	const params = Object.fromEntries(urlSearchParams.entries());

	checkRoundPage(params)

	if(!config.audio_preview){
		document.getElementById("player").style.display = "none";
	}
	else{
		if (params.player == "simple"){
			init_simpleplayer()
			player = "simple"
		} else {
			init_wavesurfer()
			tracking()
			player = "wavesurfer"
		}
	}
	
	/* Hide time stamps */
	hide_time = (typeof config.show_time === 'undefined') ? true : !config.show_time;
	config.animate_time = false;
	if (config.animate_time && config.show_time){
		hide_time = true;
	}
	if (!hide_time){
		document.getElementById("time-current").style.display = "block"
		document.getElementById("time-total").style.display = "block"
	}
}

function init_wavesurfer(){
	if (document.documentElement.getAttribute("theme") == "dark"){
		theme_params = {
			cursorColor: 'green',
			waveColor: 'lightgreen',
			progressColor: 'darkgreen'
		}
		region_color = 'rgb(255, 255, 255, 0.15)'
	}
	else{
		theme_params = {
			cursorColor: '#00B600',
			waveColor: 'darkgreen',
			progressColor: '#00D000'
		}
		region_color = 'rgb(0, 0, 0, 0.15)'
	}

	wavesurfer = WaveSurfer.create(Object.assign({
		container: '#waveform',
		height: 30,
		barWidth: 1,
		barHeight: 0.5,
		hideScrollbar: true,
		backend: 'MediaElement'
	}, theme_params));

	window.onresize = function(){wavesurfer.drawBuffer();}

	try{
		if (config.preview_z){
			let path = config.audio_preview + `?start=${config.preview_zone[0]}&end=${config.preview_zone[1]}`
			wavesurfer.load(path);
		} else{
			wavesurfer.load(config.audio_preview);
		}
		wavesurfer.on('waveform-ready',_=>{
			document.getElementById("play_pause").style.display = "block"
			setTimeout(function(){
				document.getElementById("play_pause").style.opacity = 1
				document.getElementById("loading_waveform").style.display = "none"
				wavesurfer_isReady = true;
			}, 1)
		})
	}catch{
		document.getElementById("player").style.display = "none";
	}
}

function init_simpleplayer(){
	simplePlayer = new SimplePlayer("#simple-player");
	simplePlayer.onready = _=> {
		document.getElementById("waveform").style.display = "none"
		document.getElementById("simple-player").classList.remove("hide")
		document.getElementById("play_pause").style.display = "block"
		setTimeout(function(){
			document.getElementById("play_pause").style.opacity = 1
		}, 1)
	};
	if (config.preview_z){
		let path = config.audio_preview + `?start=${config.preview_zone[0]}&end=${config.preview_zone[1]}`
		simplePlayer.load(path);
	} else{
		simplePlayer.load(config.audio_preview)
	}
	simplePlayer.onfinish = _=>{
		document.getElementById('play_pause').className = "far fa-play-circle"
		document.getElementById('play_pause').title = LANG.player_play
	}
	simplePlayer.onplay = _=> {
		document.getElementById('play_pause').className = "far fa-pause-circle"
		document.getElementById('play_pause').title = LANG.player_stop
		set_metadata()
	};
	simplePlayer.onpause = _=> {
		document.getElementById('play_pause').className = "far fa-play-circle"
		document.getElementById('play_pause').title = LANG.player_play
	};
	simplePlayer.ontimeupdate = (current, total)=> {
		document.getElementById('time-current').textContent = current;
		document.getElementById('time-total').textContent = total;
	};
}

function set_metadata(){
	navigator.mediaSession.metadata = new MediaMetadata({
		title: config.track_name,
		artist: config.artist,
		album: 'Zombi Music',
		artwork: [
			 { src: config.main_img}
		]
	});
}

function tracking(){
	function setCurrent(init=false){
		if (init){
			totalSeconds = Math.round(wavesurfer.getDuration());
			minutes = Math.floor(totalSeconds / 60);
			seconds = (totalSeconds % 60).toString().padStart(2, 0);
			string = minutes + ":" + seconds
			document.getElementById('time-total').innerText = string
		}
		else{
			totalSeconds = Math.round(wavesurfer.getCurrentTime());
			minutes = Math.floor(totalSeconds / 60);
			seconds = (totalSeconds % 60).toString().padStart(2, 0);
			string = minutes + ":" + seconds
			document.getElementById('time-current').innerText = string
		}
	}

	wavesurfer.on('ready', function (){
		setCurrent(true)
		document.getElementById('time-current').innerText = "0:00";
	})
	wavesurfer.on('play', function() {
		document.getElementById("play_pause").className = "far fa-pause-circle"
		document.getElementById("play_pause").title = LANG.player_stop
		set_metadata()
	});
	wavesurfer.on('pause', function() {
		document.getElementById("play_pause").className = "far fa-play-circle"
		document.getElementById("play_pause").title = LANG.player_play
	});
	wavesurfer.on('finish', function (){
		document.getElementById("play_pause").className = "far fa-play-circle"
		document.getElementById("play_pause").title = LANG.player_play
	})
	wavesurfer.on('seek', function() {
		setCurrent()
	})
	wavesurfer.on('audioprocess', function() {
		if(wavesurfer.isPlaying()) {
			setCurrent()
		}
	});
}

region_play = false;
function play(e){
	if (player == "wavesurfer"){
		if (wavesurfer_isReady){
			if (wavesurfer.isPlaying()){
				wavesurfer.pause()
			}
			else{
				wavesurfer.play()
			}
		}
	} else{
		if (simplePlayer.ready){
			if (simplePlayer.playing){
				simplePlayer.pause()
			}
			else{
				simplePlayer.play()
			}		
		}
	}
}
