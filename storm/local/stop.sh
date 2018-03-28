#!/bin/bash

ProcessId0=`ps -ef | grep deploy.sh |grep bash |awk '{print $2}'`
echo "$ProcessId0"
ProcessId1=`ps -ef | grep "$ProcessId0" |grep ImportTopology |awk '{print $2}'`
echo "$ProcessId1"
ProcessId2=`ps -ef | grep "$ProcessId1" |grep node |awk '{print $2}'`
#echo "$ProcessId2"

if test "$ProcessId2" != ""
then
    kill $ProcessId2
fi

if test "$ProcessId1" != ""
then
    kill $ProcessId1
fi
