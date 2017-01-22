import * as net from "net"

var traffic = 0;
var trafficCount = 0;
var connectionCount = 0;

setInterval(function () {
    trafficCount += traffic;
    var displ: string = "kb/s";
    var speed: number = (traffic / 1024);
    if (speed >= 1024) {
        speed = speed / 1024;
        speed = speed;
        displ = "mb/s";
    }
    console.log(speed.toFixed(2), displ, (trafficCount / 1024 / 1024 / 1024).toFixed(3), "gb", connectionCount.toString());
    traffic = 0;
}, 1000);

class ProxyServer {

    isListen: boolean = false;
    proxyServer: net.Server = null;

    readonly localPort: number;
    readonly targetHost: string;
    readonly targetPort: number;

    constructor(localPort: number, targetHost: string, targetPort: number) {
        this.localPort = localPort;
        this.targetHost = targetHost;
        this.targetPort = targetPort;
    }

    listen() {
        const server = net.createServer(this.onClientConnect.bind(this));
        server.listen(this.localPort, () => {
            this.isListen = true;
        });
    }

    onClientConnect(client: net.Socket) {
        connectionCount++;
        new ProxyClientProcess({
            targetHost: this.targetHost,
            targetPort: this.targetPort,
            clientSocket: client,
            onDone: () => {
                connectionCount--;
            },
            reportTraffic: (byte) => {
                traffic += byte;
            }
        });
    }

}

class ProxyClientProcess {

    readonly clientSocket: net.Socket;
    readonly targetSocket: net.Socket;
    readonly processConfig: ProxyClientProcessConfig;

    readonly clientIP: string;
    readonly clientPort: number;

    clientTraffic: number = 0;
    dataBuffer: Array<Buffer> = [];
    isConnectTarget: boolean = false;
    isClear: boolean = false;

    constructor(processConfig: ProxyClientProcessConfig) {
        this.processConfig = processConfig;
        this.clientSocket = processConfig.clientSocket;
        this.clientSocket.on("data", this.onClientSocketData.bind(this));
        this.clientSocket.on("close", this.onClientSocketClose.bind(this));
        this.clientSocket.on("error", this.onClientSocketError.bind(this));

        this.clientIP = this.clientSocket.address().address;
        this.clientPort = this.clientSocket.address().port;

        this.targetSocket = new net.Socket();
        this.targetSocket.setNoDelay(true);
        this.targetSocket.on("error", this.onTargetSocketError.bind(this));
        this.targetSocket.connect(this.processConfig.targetPort, this.processConfig.targetHost, this.onTargetSocketConnect.bind(this));
    }

    private onTargetSocketError(error: Error) {
        this.clearConnect();
    }

    private onTargetSocketConnect() {
        console.log(`${this.clientIP}:${this.clientPort} -> proxy -> ${this.processConfig.targetHost}:${this.processConfig.targetPort}`);
        for (var buffer of this.dataBuffer) {
            this.targetSocket.write(buffer);
        }
        this.dataBuffer = [];
        this.isConnectTarget = true;
        this.targetSocket.on("data", this.onTargetSocketData.bind(this));
        this.targetSocket.on("close", this.onClientSocketClose.bind(this));
    }

    private onTargetSocketData(data: Buffer) {
        this.clientTraffic += data.length;
        if (this.processConfig.reportTraffic) {
            this.processConfig.reportTraffic(this.clientTraffic);
            this.clientTraffic = 0;
        }
        this.clientSocket.write(data);
    }

    private onTargetSocketClose() {
        this.clearConnect();
    }

    private onClientSocketData(data: Buffer) {
        this.clientTraffic += data.length;
        if (this.processConfig.reportTraffic) {
            this.processConfig.reportTraffic(this.clientTraffic);
            this.clientTraffic = 0;
        }
        if (this.isConnectTarget) {
            this.targetSocket.write(data);
        } else {
            this.dataBuffer.push(data);
        }
    }

    private onClientSocketClose() {
        this.clearConnect();
    }

    private onClientSocketError(error: Error) {
        this.clearConnect();
        console.log("Client Socket Error:", error.message);
    }

    public clearConnect() {
        if (this.isClear) {
            return;
        }
        this.isClear = true;
        if (this.isConnectTarget) {
            this.targetSocket.destroy();
        }
        this.clientSocket.destroy();
        this.dataBuffer = [];

        if (this.processConfig.onDone) {
            this.processConfig.onDone();
        }
    }
}

interface ProxyClientProcessConfig {
    targetHost: string;
    targetPort: number;
    clientSocket: net.Socket;

    onDone?: Function;
    reportTraffic?: Function;
}

// forward port 1500 to 192.168.0.250:60704
var proxy = new ProxyServer(1500, "192.168.0.250", 60704);
proxy.listen();