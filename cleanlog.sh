#!/bin/bash

cd /opt/rippled-historical-database
>back.log
>storm/local/console.out

pm2 flush
#>/root/.pm2/logs/v2live-out-1.log
#>/root/.pm2/logs/v2api-out-0.log
