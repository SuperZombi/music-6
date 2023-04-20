main()
function logout(){
	if (localStorage.getItem('adminName') && localStorage.getItem('adminPassword')){
		localStorage.setItem('userName', localStorage.getItem('adminName'))
		localStorage.setItem('userPassword', localStorage.getItem('adminPassword'))
		setCookie('userName', localStorage.getItem('adminName'))
		setCookie('userPassword', localStorage.getItem('adminPassword'))
		window.localStorage.removeItem("adminName")
		window.localStorage.removeItem("adminPassword")
		window.location.reload()
	} else{
		window.localStorage.removeItem("userName")
		window.localStorage.removeItem("userPassword")
		deleteCookie("userName")
		deleteCookie("userPassword")
		goToLogin()
	}
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
function main(){
	document.title = LANG.messenger
	
	local_storage = { ...localStorage };
	if (local_storage.userName && local_storage.userPassword){
		notice = Notification('#notifications');
		document.querySelector("#notifications").classList.add("notifications_top")
		submain()
	}
	else{
		goToLogin()
	}
}
function submain(){
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
			if (document.querySelector("#new-chat-popup").classList.contains("show")){
				document.getElementById("new-chat-popup").classList.remove("show")
			} else{
				document.querySelector("#back-button").onclick()
				document.querySelector("#chat-body").classList.remove("show")
				messages.innerHTML = ""
			}
		}
		else if (e.keyCode == 13 && !e.shiftKey){
			if (document.querySelector("#new-chat-popup").classList.contains("show")){
				document.querySelector("#new-chat-popup [role=button]").onclick()
			}
		}
	}
	message_input.onkeydown = e=>{
		if (e.keyCode == 13 && !e.shiftKey){
			e.preventDefault();
			send.onclick()
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
	document.querySelector("#new-chat-popup [role=button]").onclick = _=>{
		let chatName = document.querySelector("#new-chat-popup input").value.trim()
		if (chatName){
			window.location.hash = chatName
			newChat()
		}
	}
	document.getElementById("chats-wrapper").addEventListener("click", event=>{
		let path = event.path || (event.composedPath && event.composedPath());
		if (path.includes(document.querySelector("#askNewChat"))){return}
		else{
			document.getElementById("new-chat-popup").classList.remove("show")
		}
		if (!path.filter(y=>y.classList && y.classList.contains("message")).length > 0){
			document.querySelectorAll("#messages-container .message.hovered").forEach(e=>{
				e.classList.remove("hovered")
				e.querySelector(".helper-body").classList.remove("show")
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
	}

	addFavorites()

	let xhr = new XMLHttpRequest();
	xhr.open("POST", '/api/messenger/get_chats')
	xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
	xhr.onload = function() {
		if (xhr.status == 200){ 
			let answer = JSON.parse(xhr.response);
			if (answer.successfully){
				answer.chats.forEach(chat=>{
					if (chat.chat_name == local_storage.userName){return}
					addChat(chat.chat_name, chat.chat_image, chat.unread_messages_count, chat.readOnly)
				})
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
		if (msg.from_user == msg.chat){return}
		let active_chat = chats.querySelector(".active")
		if (active_chat && msg.from_user == active_chat.getAttribute("chat-name")){
			prepareMessage(msg)
			markChatAsReaded(active_chat.getAttribute("chat-name"))
		} else{
			let target = chats.querySelector(`[chat-name="${msg.from_user}"]`)
			if (target){
				let notif = target.querySelector(".notification-dot")
				if (notif.classList.contains("hidden")){
					notif.classList.remove("hidden")
					notif.innerHTML = "1"
				} else{
					notif.innerHTML = parseInt(notif.innerHTML) + 1
				}
			} else{
				loadProfileImage(msg.from_user, url=>{
					addChat(msg.from_user, url, 1)
				})
			}
		}
	});
	socket.on('delete_message', function(msg) {
		let el = document.querySelector(`.message[message-id='${msg.id}']`)
		if (el){
			el.remove()
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
					prepareMessage(answer.message)

					let name = document.querySelector("#chat-info .chat-name").innerHTML
					let ch_ = chats.querySelector(`[chat-name="${name}"]`)
					if (ch_){
						ch_.classList.add("active")
					} else{
						let img_ = document.querySelector("#chat-info .chat-icon img")
						let chat = addChat(name, img_.src)
						chat.classList.add("active")
					}

					const url_ = new URL(window.location);
					if (url_.searchParams.has('new-chat')){
						url_.searchParams.delete('new-chat');
						window.history.pushState(null, '', url_.toString());
					}
					return
				}
			}
			notice.Error(LANG.failed_send_message)
		}
		xhr.send(JSON.stringify({
			'user': local_storage.userName,
			'password': local_storage.userPassword,
			"chat": decodeURI(window.location.hash).substring(1),
			"message": message_input.value.trim()
		}))
	}

	let search = new URLSearchParams(window.location.search)
	if (search.has("new-chat")){
		newChat()
	}

	initAtachments()
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
	url.href = new URL("/" + chatName.toLocaleLowerCase(), window.location.href).href

	loadProfileImage(chatName, url=>{
		img_.src = url
		document.title = `${LANG.messenger} • ${chatName}`
		document.getElementById("new-chat-popup").classList.remove("show")
		messages.innerHTML = ""
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
	loadProfileImage(local_storage.userName, url=>{
		let div = addChat(local_storage.userName, url)
		div.querySelector(".chat-name").innerHTML = LANG.saved_messages
	})
}

function addChat(chatName, chatImage="", unread_messages=0, readOnly=false){
	let div = document.createElement("div")
	div.className = "chat"
	div.setAttribute("chat-name", chatName)
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
		document.getElementById("chat-body").classList.add("show")
		chats.querySelectorAll(".active").forEach(e=>{
			e.classList.remove("active")
		})
		div.classList.add("active")
		chats.classList.remove("show")
		
		let name = document.querySelector("#chat-info .chat-name")
		let img_ = document.querySelector("#chat-info .chat-icon img")
		let url = document.querySelector("#chat-info .url")
		name.innerHTML = chatName
		img_.src = chatImage
		if (chatName == local_storage.userName){
			url.href = new URL("/account/", window.location.href).href
		} else{
			url.href = new URL("/" + chatName.toLocaleLowerCase(), window.location.href).href
		}

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
	messages.innerHTML = ""

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
	messages.innerHTML += `
		<div class="message info time" unix="${timestamp}">
			<div class="message-body">
				${date}
			</div>
		</div>
	`
}
function addInfoNewMessages(){
	messages.innerHTML += `
		<div class="message info new">
			<div class="message-body">
				Новые сообщения
			</div>
		</div>
	`
}
function addMessage(id, text, from, time){
	let scrollAfter = false;
	if (messages.scrollTop + messages.clientHeight + 10 >= messages.scrollHeight || from == local_storage.userName){
		scrollAfter = true;
	}
	let msg = document.createElement('div')
	msg.className = "message"
	msg.setAttribute("message-id", id)
	msg.classList.add(from == local_storage.userName ? "from-me": "from-other")

	// ${from == local_storage.userName ? "": `<div class="user">${from}</div>`}
	msg.innerHTML = `
		<div class="message-body">

			<div class="tail">
				<div class="text"></div>
				<time>${time}</time>
			</div>
		</div>

		<div class="helper">
			<i class="fa fa-ellipsis"></i>
			<div class="helper-body">
				<div action="delete">${LANG.delete}</div>
			</div>
		</div>
	`
	msg.querySelector(".text").innerHTML = marked.parseInline(text)
	msg.querySelector(".helper").onclick = _=>{
		msg.querySelector(".helper-body").classList.toggle("show")
		msg.classList.toggle("hovered")
	}
	msg.querySelectorAll("img").forEach(img=>{
		img.onclick =_=>{
			openImageFullScreen(img)
		}
	})
	msg.querySelector('[action="delete"]').onclick = _=>{
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
	}
	messages.appendChild(msg)
	if (scrollAfter){
		messages.scrollTop = messages.scrollHeight;
	}
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
	addMessage(msg.id, msg.message, msg.from_user, time)
}
function buildMessages(array){
	messages.classList.remove("smooth")
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
		addMessage(msg.id, msg.message, msg.from_user, time)
	})

	if (new_messages_showed){
		messages.querySelector(".info.new").scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
	} else{
		messages.scrollTop = messages.scrollHeight;
	}
	messages.classList.add("smooth")
}


function initAtachments(){
	document.querySelector("#add-attachment").onclick = _=>{
		if (document.querySelectorAll("#attachments > *").length >= 4){
			notice.Error(LANG.max_files_count)
			return
		}
		let input = document.createElement('input');
		input.type = 'file';
		input.accept = "image/*";
		input.onchange = async e => { 
			var file = e.target.files[0];
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
		input.click();
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
}
function closeFullScreener(){
	document.querySelector("#media-fullscreener").classList.add("hide")
}
document.querySelector("#media-fullscreener").onclick = event=>{
	let path = event.path || (event.composedPath && event.composedPath());
	if (path.includes(document.querySelector("#media-fullscreener img"))){return}
	else{
		closeFullScreener()
	}
}
