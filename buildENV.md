# chainsql V2 搭建
## 依赖环境版本

```
peersafe@root:~/v2/rippled-historical-database$ node --version
v10.24.1
peersafe@root:~/v2/rippled-historical-database$ npm --version
6.14.12
peersafe@root:~/v2/rippled-historical-database$ java -version
openjdk version "1.8.0_292"
OpenJDK Runtime Environment (build 1.8.0_292-8u292-b10-0ubuntu1~18.04-b10)
OpenJDK 64-Bit Server VM (build 25.292-b10, mixed mode)
```

hbase使用hbase-2.3.5-bin.tar.gz

## hbase及v2配置
### hbase配置
conf/hbase-env.sh
```
export JAVA_HOME=/usr/lib/jvm/java-8-openjdk-amd64/
export HBASE_MANAGES_ZK=true
```
conf/hbase-site.xml
```
<property>
    <name>hbase.cluster.distributed</name>
    <value>false</value>
  </property>
  <property>
    <name>hbase.rootdir</name>
    <value>./tmp</value>
  </property>
  <property>
    <name>hbase.unsafe.stream.capability.enforce</name>
    <value>false</value>
  </property>
```
### v2配置

rippled-historical-database配置信息：

修改config/config.json文件，没有就手动建一个
- 所有prefix属性根据需要修改，测试就用【test_】，正式就用【pro_】
- ripple-server填写正确的chainsql的websocket地址
- hbase及hbase-rest的host根据实际修改，port根据实际修改，建议使用默认值。
```
{
  "port": 7111,
  "logLevel": 2,
  "logFile": "./log/v2api.log",
  "genesis_ledger": 1,
  "hbase" : {
    "logLevel" : 2,
    "prefix" : "test_",
    "servers" : [
      {"host" : "127.0.0.1", "port": 9090}
    ]
  },
  "ripple": {
    "server" : "ws://127.0.0.1:6006"
  },
  "cacheControl": {
    "max-age": 10,
    "stale-while-revalidate": 30,
    "stale-if-error": 300
  },
  "hbase-rest" : {
    "prefix" : "test_",
    "host"   : "127.0.0.1",
    "port"   : 8080
  },
  "rateLimit": {
    "max": 60,
    "duration": 60000,
    "whitelist": [],
    "blacklist": []
  }
}
```
修改config/import.config.json
修改方式同config/config.json
```
{
  "logLevel": 2,
  "logFile": "./log/v2live.log",
  "ripple": {
    "server": "ws://127.0.0.1:6006"
  },
  "hbase" : {
    "prefix" : "test_",
    "servers" : [
      {"host" : "127.0.0.1", "port": 9090}
    ]
  },
  "hbase-rest" : {
    "prefix" : "test_",
    "host"   : "127.0.0.1",
    "port"   : 8080
  }
}
```
## 启动步骤
### 启动hbase
bin/start-hbase.sh

启动hbase rest server
bin/hbase-daemon.sh start rest -p <port>
【-p】选项可以不加，默认端口8080

启动hbase thrift server
bin/hbase-daemon.sh start thrift -f -p <port>
【-p】选项可以不加，默认端口9090

### 启动V2
1. 执行npm install;
2. 创建log目录;
3. node import/createTables.js 导入表到hbase
4. pm2 启动 import/live.js
5. pm2 启动 api/index.js
6. pm2 启动 import/backfill.js


**以下为历史信息，仅作为参考**

~~# ripple V2 api 环境搭建~~

## 1、项目源码

 [git地址](https://github.com/peersafe/rippled-historical-database) 
 
 分支使用 v2api
 
## 2、本地环境配置

### 安装依赖
npm install

### 修改配置文件
(1) 生成配置文件，node install.js

(2) api.config.json

```
{
	"port" : 7111,
	"ripple": {
		"server": "ws://139.198.11.189:6006"
	},
	"hbase" : {
		"logLevel" : 2,
		"prefix" : "pro",
		"servers" : [
			{"host" : "192.168.0.193", "port": 9090}
		]
	}
}
```

(3) import.config.json

```
{
	"logLevel": 2,
	"logFile": null,
	"ripple": {
		"server": "ws://139.198.11.189:6006"
	},
	"hbase" : {
		"prefix" : "pro",
		"servers" : [
			{"host" : "192.168.0.193", "port": 9090}
		]
	},
	"hbase-rest" : {
		"prefix" : "pro_",
		"host" : "192.168.0.193",
		"port" : 8080
	}
}
```

3、本地启动hbase

```
修改docker-compose.yaml

(1)添加端口映射9090，hbase对外提供服务

(2)添加端口映射8080，hbase对外提供rest服务

(3)添加端口映射16010，hbase对外提供webUI 端口

docker-compose up -d hbase
```

4、启动V2 data 服务

```
(1)创建表格，node import/createTables
(2)实时导入ledger, 开启新终端， node import/live
(3)npm start
```
 
## 青云环境配置

### 1、青云搭建hbase集群

登录青云控制台，应用中心选择hbase，创建hbase集群


注意：青云hbase集群创建后，并不能直接使用，因为默认使用的thrift2 server, 而我们的v2 api使用的thrift1

```
通过web界面，登录hbase集群客户端机器,用户名：ubuntu,密码：hbase
（1）sudo su 输入密码：hbase，切换到root账户
（2）cd /opt/hbase/bin; vi hbase-config.sh 在尾部插入一行：export HBASE_HEAPSIZE=2048
（3）./hbase-daemon.sh start thrift -threadpool -m 200 -w 500 启动thrift server
（4）./hbase-daemon.sh start rest 启动rest服务
```
### 2、搭建storm集群

依赖： storm需要依赖zookeeper，因此需要首先创建zookeeper集群（使用青云appcenter直接创建即可）

```
 (1) 青云创建3台物理机，分别安装jdk、storm、maven、node、npm。注意：storm版本一定要是0.9.3
 (2) 修改strom配置文件
storm.zookeeper.servers:
	- "192.168.0.2"
	- "192.168.0.5"
	- "192.168.0.6"
storm.local.dir: "/usr/local/storm/data"
nimbus.seeds: ["192.168.0.18"] // strom 主节点ip
supervisor.slots.ports:
	- 6700
	- 6701
	- 6702
	- 6703
（3） 启动storm
	主节点：
		nohup storm nimbus > nimbus.log 2>&1 &   启动主控节点守护进程
		nohup storm ui > ui.log 2>&1 & 启动主空节点ui进程  8080
	所有节点：
		nohup storm supervisor > supervisor.log 2>&1 & 启动工作节点守护进程
```

### 3、启动v2api服务

```
（1）修改config，配置对应的ip，port
（2）node import/createTables.js 导入表到hbase
（3）后台运行同步最新账本服务 nohup node import/live.js > live.log 2>&1 &
（4）后台运行导入历史账本服务 nohup node import/backfill.js > backfill.log 2>&1 &
（5）后台运行api server nohup node api/index.js > api.log 2>&1 &
```

### 4、启动storm任务

```
（1）进入v2api项目，cd storm/production
（2）运行./import.sh start
（3）通过webUI 查看storm运行状况
```