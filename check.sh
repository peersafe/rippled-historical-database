#!/bin/bash

cd /opt/rippled-historical-database

RESTART=`find /root/.pm2/logs/v2live-out-1.log -mmin +3`

if test "$RESTART" != ""
then
    echo "restarting v2live"
    pm2 restart v2live
    sleep 10
    echo "begin to backfill"
    node import/backfill.js >>back.log 2>&1
    StartIndex=`tail -n 1 back.log |grep 'HBASE_HISTORY stop index reached' | awk '{print $8}'`
    echo "stop index: $StartIndex"
    if test "$StartIndex" != ""
    then
        cat config/import.config.json |jq .startIndex=$StartIndex > config/import.config.json.tmp
        #is equal the below
        #cat config/import.config.json |jq .startIndex=`echo "$StartIndex"` > config/import.config.json.2

        mv config/import.config.json.tmp config/import.config.json
    fi
fi

cd storm/local/

RESTART=`find ./console.out -mmin +3`
if test "$RESTART" != ""
then
    echo "stoping storm importer"
    ./stop.sh
    sleep 20
    echo "starting storm importer"
    ./start.sh
fi