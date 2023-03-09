class SimplePlayer{
	constructor(selector){
		this.audioPlayer = document.querySelector(selector);
		this.progress = this.audioPlayer.querySelector('.progress');
		this.slider = this.audioPlayer.querySelector('.slider')
		this.player = this.audioPlayer.querySelector('audio');
		this.ready = false;
		this.playing = false;
		this.dragActive = false;
		this.onfinish = function(){}
		this.onplay = function(){}
		this.onpause = function(){}
		this.onready = function(){}
		this.ontimeupdate = function(){}

		this.player.addEventListener('timeupdate', _=>{
			var current = this.player.currentTime;
			var percent = (current / this.player.duration) * 100;
			this.progress.style.width = percent + '%';
			this.ontimeupdate(this.formatTime(current), this.formatTime(this.player.duration))
		});
		this.player.addEventListener('loadedmetadata', () => {
			this.ontimeupdate(this.formatTime(0), this.formatTime(this.player.duration))
		});
		this.player.addEventListener('play', _=>{
			this.playing = true;
			this.onplay()
		});
		this.player.addEventListener('pause', _=>{
			this.playing = false;
			this.onpause()
		});
		this.player.addEventListener('ended', _=>{
			this.player.currentTime = 0;
			this.onfinish()
		});

		let pin = this.slider.querySelector('.pin');
		this.slider.addEventListener('mousemove', event=>{
			this.rewind(event);
		});
		this.slider.addEventListener('touchmove', event=>{
			this.rewind(event);
		});
		this.slider.addEventListener('touchstart', event=>{
			this.dragActive = true;
			this.rewind(event);
		});
		this.slider.addEventListener('mousedown', event=>{
			this.dragActive = true;
			this.rewind(event);
		});
		window.addEventListener('mouseup', _=>{this.dragActive=false});
	}
	formatTime(time) {
		var min = Math.floor(time / 60);
		var sec = Math.floor(time % 60);
		return min + ':' + ((sec<10) ? ('0' + sec) : sec);
	}
	load(src){
		this.player.addEventListener('canplaythrough', _=>{
			this.ready = true;
			this.onready()
		});
		this.player.src = src;
	}
	play(){
		this.player.play();
	}
	pause(){
		this.player.pause();
	}
	rewind(event) {
		var slider = this.slider
		function getCoefficient(event) {
			var rect = slider.getBoundingClientRect();
			let X = event.clientX || event.touches[0].clientX;
			let clickedPoint = X - rect.left;
			let K = 0;
			let width = slider.clientWidth;
			K = clickedPoint / width;
			K = Math.min(1, Math.max(0, K))
			return K;
		}
		if (this.dragActive){
			this.player.currentTime = this.player.duration * getCoefficient(event);
		}
	}
}
