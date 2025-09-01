"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const testing_1 = require("@nestjs/testing");
const app_controller_1 = require("./app.controller");
const app_service_1 = require("./app.service");
const node_test_1 = require("node:test");
(0, node_test_1.describe)('AppController', () => {
    let appController;
    (0, node_test_1.beforeEach)(async () => {
        const app = await testing_1.Test.createTestingModule({
            controllers: [app_controller_1.AppController],
            providers: [app_service_1.AppService],
        }).compile();
        appController = app.get(app_controller_1.AppController);
    });
    (0, node_test_1.describe)('root', () => {
        (0, node_test_1.it)('should return "Hello World!"', () => {
            expect(appController.getHello()).toBe('Hello World!');
        });
    });
});
//# sourceMappingURL=app.controller.spec.js.map