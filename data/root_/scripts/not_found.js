window.onload = function(){
	_404()
}
function _404(){
	document.ontouchmove = function(e){
		worker(e.touches[0])
	}
	document.onmousemove = function(e){
		worker(e)
	}
	function worker(e){
		var targetNode = document.getElementById("404");
		let centerX = targetNode.offsetLeft + targetNode.offsetWidth / 2;
		let centerY = targetNode.offsetTop + targetNode.offsetHeight / 2;

		x1 = (centerX - e.clientX) /10;
		y1 = (centerY - e.clientY) /10;

		if (x1 > 30) { x1 = 30 }
		if (y1 > 30){ y1 = 30 }
		if (x1 < -30) { x1 = -30 }
		if (y1 < -30){ y1 = -30 }
			
		document.getElementById("404").style.filter = `drop-shadow(${x1}px ${y1}px 20px grey)`;
	}
}
