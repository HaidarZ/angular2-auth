import "core-js";
import { AuthConfig, AuthHttp, tokenNotExpired, AuthHelper } from "./angular2-auth";
import { Observable } from "rxjs";
import { encodeTestToken } from "./angular2-auth-test-helpers";

describe('AuthConfig', () => {
    'use strict';

    it('should have default values', () => {
        const config = new AuthConfig().getConfig();
        expect(config).toBeDefined();
        expect(config.headerName).toBe("Authorization");
        expect(config.headerPrefix).toBe("Bearer ");
        expect(config.tokenName).toBe("id_token");
        expect(config.noJwtError).toBe(false);
        expect(config.noTokenScheme).toBe(false);
        expect(config.globalHeaders).toEqual([]);
        expect(config.tokenGetter).toBeDefined();
        const token = "Token";
        localStorage.setItem(config.tokenName, token);
        expect(config.tokenGetter()).toBe(token);
    });

    it('should have default values', () => {
        const configExpected = {
            headerName: "Foo",
            headerPrefix: "Bar",
            tokenName: "token",
            tokenGetter: () => "this is a token",
            noJwtError: true,
            globalHeaders: [{ "header": "value" }, { "header2": "value2" }],
            noTokenScheme: true
        };
        const config = new AuthConfig(configExpected).getConfig();
        expect(config).toBeDefined();
        expect(config.headerName).toBe(configExpected.headerName);
        expect(config.headerPrefix).toBe(configExpected.headerPrefix + " ");
        expect(config.tokenName).toBe(configExpected.tokenName);
        expect(config.noJwtError).toBe(configExpected.noJwtError);
        expect(config.noTokenScheme).toBe(configExpected.noTokenScheme);
        expect(config.globalHeaders).toEqual(configExpected.globalHeaders);
        expect(config.tokenGetter).toBeDefined();
        expect(config.tokenGetter()).toBe("this is a token");
    });

    it('should use custom token name in default tokenGetter', () => {
        const configExpected = { tokenName: 'Token' };
        const token = 'token';
        const config = new AuthConfig(configExpected).getConfig();
        localStorage.setItem(configExpected.tokenName, token);
        expect(config).toBeDefined();
        expect(config.tokenName).toBe(configExpected.tokenName);
        expect(config.tokenGetter()).toBe(token);
    });

});