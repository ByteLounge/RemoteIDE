"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBackendServer = startBackendServer;
const http_1 = __importDefault(require("http"));
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const db_1 = require("./db");
const auth_1 = require("./auth");
const routes_1 = require("./routes");
const relay_1 = require("./relay");
const shared_utils_1 = require("@remotedev/shared-utils");
const logger = (0, shared_utils_1.createLogger)('BackendApp');
const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 4000;
const HOST = process.env.HOST || '0.0.0.0';
function startBackendServer() {
    const app = (0, express_1.default)();
    app.use((0, cors_1.default)());
    app.use(express_1.default.json({ limit: '50mb' }));
    const db = new db_1.BackendDatabase();
    const authService = new auth_1.AuthService(db.getRawDb());
    const apiRouter = (0, routes_1.createApiRouter)(db.getRawDb(), authService);
    app.use('/api/v1', apiRouter);
    const server = http_1.default.createServer(app);
    const relay = new relay_1.RelayServer(server, db.getRawDb(), authService);
    server.listen(PORT, HOST, () => {
        logger.info(`RemoteDev Cloud Backend running on http://${HOST}:${PORT}`);
        logger.info(`WebSocket Relay available at ws://${HOST}:${PORT}/ws`);
    });
    return { server, db, authService, relay };
}
if (require.main === module) {
    startBackendServer();
}
