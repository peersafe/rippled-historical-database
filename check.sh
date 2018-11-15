#!/bin/bash

export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64
export PATH=$PATH:/opt/apache-storm-0.9.3/bin

#check hbase master
RESTART=`jps |grep HMaster`
if test "$RESTART" = ""
then
    echo "starting hbase master"
    cd /opt/hbase-1.2.6
    ./bin/start-hbase.sh
    sleep 10
fi

#check hbase thrift
RESTART=`jps |grep ThriftServer`
if test "$RESTART" = ""
then
    echo "starting hbase thrift"
    cd /opt/hbase-1.2.6
    ./bin/hbase-daemon.sh start thrift
    sleep 2
fi

#check hbase rest
RESTART=`jps |grep RESTServer`
if test "$RESTART" = ""
then
    echo "starting hbase rest"
    cd /opt/hbase-1.2.6
    ./bin/hbase-daemon.sh start rest
    sleep 2
fi

#check nimbus
RESTART=`jps |grep nimbus`
if test "$RESTART" = ""
then
    echo "starting nimbus"
    storm nimbus &
    sleep 10
fi

#check supervisor
RESTART=`jps |grep supervisor`
if test "$RESTART" = ""
then
    echo "starting supervisor"
    storm supervisor &
    sleep 10
fi

cd /opt/rippled-historical-database

#check v2live
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
#check storm importer
RESTART=`find ./console.out -mmin +3`
if test "$RESTART" != ""
then
    echo "stoping storm importer"
    ./stop.sh
    sleep 20
    echo "starting storm importer"
    ./start.sh
fi
