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
		filename += `>${window.location.hash.substring(1)}`
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

	var input = document.getElementById("message-input")
	input.oninput = _=>{
		input.style.height = '0';
		if (input.value != ""){
			input.style.height = input.scrollHeight + 'px';
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
	input.onkeydown = e=>{
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
					let openedChat = window.location.hash.substring(1)
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

	send.onclick = _=>{
		if (send.classList.contains("disabled")){return}
		send.classList.add("disabled")
		input.readOnly = true;

		let xhr = new XMLHttpRequest();
		xhr.open("POST", '/api/messenger/send_message')
		xhr.setRequestHeader('Content-type', 'application/json; charset=utf-8');
		xhr.onload = function() {
			input.readOnly = false;
			send.classList.remove("disabled")
			if (xhr.status == 200){ 
				let answer = JSON.parse(xhr.response);
				if (answer.successfully){
					input.value = ""
					input.oninput()
					send.classList.add("disabled")
					prepareMessage(answer.message)

					const url_ = new URL(window.location);
					if (url_.searchParams.has('new-chat')){
						let name = document.querySelector("#chat-info .chat-name")
						let img_ = document.querySelector("#chat-info .chat-icon img")
						
						let chat = addChat(name.innerHTML, img_.src)
						chat.classList.add("active")

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
			"chat": window.location.hash.substring(1),
			"message": input.value.trim()
		}))
	}

	let search = new URLSearchParams(window.location.search)
	if (search.has("new-chat")){
		newChat()
	}
}

function newChat(){
	let chatName = window.location.hash.substring(1);
	let chatEl = chats.querySelector(`[chat-name="${chatName}"]`)
	if (chatEl){
		chatEl.onclick();
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
		if (document.querySelector("#new-chat-popup").classList.contains("show")){
			document.getElementById("new-chat-popup").classList.remove("show")
		}
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
function addMessage(text, from, time){
	let scrollAfter = false;
	if (messages.scrollTop + messages.clientHeight + 10 >= messages.scrollHeight || from == local_storage.userName){
		scrollAfter = true;
	}
	messages.innerHTML += `
		<div class="message ${from == local_storage.userName ? "from-me": "from-other"}">
			<div class="message-body">
				
				<div class="tail">
					<div class="text">${text}</div>
					<time>${time}</time>
				</div>
			</div>
		</div>
	`
	if (scrollAfter){
		messages.scrollTop = messages.scrollHeight;
	}
	// ${from == local_storage.userName ? "": `<div class="user">${from}</div>`}
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
	addMessage(msg.message, msg.from_user, time)
}
function buildMessages(array){
	messages.classList.remove("smooth")
	last_date = ""
	let current_year = new Date().getFullYear();
	let new_messages_showed = false;
	array.forEach(msg=>{
		if (msg.is_read == 0 && msg.from_user != local_storage.userName && !new_messages_showed){
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
		addMessage(msg.message, msg.from_user, time)
	})

	if (new_messages_showed){
		messages.querySelector(".info.new").scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
	} else{
		messages.scrollTop = messages.scrollHeight;
	}
	messages.classList.add("smooth")
}
