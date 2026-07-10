#!/bin/sh
# Start Grafana after provisioning is ready.
set -e
echo '>>> Waiting for Grafana provisioning files...'
while [ ! -f /etc/grafana/provisioning/datasources/influx.yml ]; do sleep 1; done
if [ -f /usr/local/bin/grafana-init-users.sh ]; then
  /bin/sh /usr/local/bin/grafana-init-users.sh &
fi
exec /run.sh
