self.addEventListener('message', function(event) {
	if (event.data) {
		if (event.data.delete_notification){
			event.waitUntil(
				self.registration.getNotifications().then(function(notifications) {
					notifications.forEach(function(notification) {
						if (notification.tag === event.data.delete_notification) {
							notification.close();
						}
					});
				})
			);
		}
	}
});

self.addEventListener('notificationclick', function(event) {
	let from_user = event.notification.tag;
	event.waitUntil(clients.matchAll({
		type: 'window',
		includeUncontrolled: true
	}).then(function(clientList) {
		for (var i = 0; i < clientList.length; i++) {
			var client = clientList[i];
			client.focus();
			client.postMessage({
				open_chat: from_user
			});
			return;
		}
		if (clients.openWindow) {
			clients.openWindow(`/account/messenger#${from_user}`, {
				reuseExisting: true
			});
		}
	}));
});
