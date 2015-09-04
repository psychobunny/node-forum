<!-- IMPORT admin/settings/header.tpl -->

<div class="row">
	<div class="col-sm-2 col-xs-12 settings-header">[[admin:sockets.reconnection_settings]]</div>
	<div class="col-sm-10 col-xs-12">
		<form>
			<div class="form-group">
				<label for="maxReconnectionAttempts">[[admin:sockets.max_reconnection_attempts]]</label>
				<input class="form-control" id="maxReconnectionAttempts" type="text" value="5" placeholder="Default: 5" data-field="maxReconnectionAttempts" />
			</div>
			<div class="form-group">
				<label for="reconnectionDelay">[[admin:sockets.reconnection_delay]]</label>
				<input class="form-control" id="reconnectionDelay" type="text" value="1500" placeholder="Default: 1500" data-field="reconnectionDelay" />
			</div>
		</form>
	</div>
</div>

<!-- IMPORT admin/settings/footer.tpl -->