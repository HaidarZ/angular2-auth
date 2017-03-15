import {
    Http,
    Headers,
    Request,
    RequestOptions,
    RequestOptionsArgs,
    RequestMethod,
    Response,
    HttpModule
} from "@angular/http";
import {Injectable, Provider, NgModule, Optional, SkipSelf, ModuleWithProviders} from "@angular/core";
import {Observable} from "rxjs/Observable";
import "rxjs/add/observable/fromPromise";
import "rxjs/add/operator/mergeMap";

export interface IAuthConfig {
    globalHeaders: Array<Object>;
    headerName: string;
    headerPrefix: string;
    noTokenScheme?: boolean;
    tokenGetter: () => string | Promise<string>;
    expiryDateGetter: () => number | Promise<number>;
    tokenName: string;
    expiryDateName: string;
}

export interface IAuthConfigOptional {
    headerName?: string;
    headerPrefix?: string;
    tokenName?: string;
    expiryDateName?: string;
    tokenGetter?: () => string | Promise<string>;
    expiryDateGetter?: () => number | Promise<number>;
    globalHeaders?: Array<Object>;
    noTokenScheme?: boolean;
}

export class AuthConfigConsts {
    public static DEFAULT_TOKEN_NAME = 'access_token';
    public static DEFAULT_EXPIRY_NAME = 'expires_in';
    public static DEFAULT_HEADER_NAME = 'Authorization';
    public static HEADER_PREFIX_BEARER = 'Bearer ';
}

const AuthConfigDefaults: IAuthConfig = {
    headerName: AuthConfigConsts.DEFAULT_HEADER_NAME,
    headerPrefix: null,
    tokenName: AuthConfigConsts.DEFAULT_TOKEN_NAME,
    expiryDateName: AuthConfigConsts.DEFAULT_EXPIRY_NAME,
    tokenGetter: () => localStorage.getItem(AuthConfigDefaults.tokenName) as string,
    expiryDateGetter: () => Number(localStorage.getItem(AuthConfigDefaults.expiryDateName)) as number,
    globalHeaders: [],
    noTokenScheme: false
};

/**
 * Sets up the authentication configuration.
 */

export class AuthConfig {

    private _config: IAuthConfig;

    constructor(config?: IAuthConfigOptional) {
        config = config || {};
        this._config = objectAssign({}, AuthConfigDefaults, config);
        if (this._config.headerPrefix) {
            this._config.headerPrefix += ' ';
        } else if (this._config.noTokenScheme) {
            this._config.headerPrefix = '';
        } else {
            this._config.headerPrefix = AuthConfigConsts.HEADER_PREFIX_BEARER;
        }

        if (config.tokenName && !config.tokenGetter) {
            this._config.tokenGetter = () => localStorage.getItem(config.tokenName) as string;
        }

        if (config.expiryDateName && !config.expiryDateGetter) {
            this._config.expiryDateGetter = () => Number(localStorage.getItem(config.expiryDateName)) as number;
        }
    }

    public getConfig(): IAuthConfig {
        return this._config;
    }

}

export class AuthHttpError extends Error {
}

/**
 * Allows for explicit authenticated HTTP requests.
 */

@Injectable()
export class AuthHttp {

    private config: IAuthConfig;
    public tokenStream: Observable<string>;
    public expiryDateStream: Observable<number>;

    constructor(options: AuthConfig, private http: Http, private defOpts?: RequestOptions) {
        this.config = options.getConfig();

        this.tokenStream = new Observable<string>((obs: any) => {
            obs.next(this.config.tokenGetter());
        });

        this.expiryDateStream = new Observable<number>((obs: any) => {
            obs.next(this.config.expiryDateGetter);
        })
    }

    private mergeOptions(providedOpts: RequestOptionsArgs, defaultOpts?: RequestOptions) {
        let newOptions = defaultOpts || new RequestOptions();
        if (this.config.globalHeaders) {
            this.setGlobalHeaders(this.config.globalHeaders, providedOpts);
        }

        newOptions = newOptions.merge(new RequestOptions(providedOpts));

        return newOptions;
    }

    private requestHelper(requestArgs: RequestOptionsArgs, additionalOptions?: RequestOptionsArgs): Observable<Response> {
        let options = new RequestOptions(requestArgs);
        if (additionalOptions) {
            options = options.merge(additionalOptions);
        }
        return this.request(new Request(this.mergeOptions(options, this.defOpts)));
    }

    private requestWithToken(req: Request, token: string): Observable<Response> {
        //TODO: check if the token is expired
        if (null == token) {
            return new Observable<Response>((obs: any) => {
                obs.error(new AuthHttpError('No token present or has expired'));
            });
        } else {
            req.headers.set(this.config.headerName, this.config.headerPrefix + token);
        }

        return this.http.request(req);
    }

    public setGlobalHeaders(headers: Array<Object>, request: Request | RequestOptionsArgs) {
        if (!request.headers) {
            request.headers = new Headers();
        }
        headers.forEach((header: Object) => {
            let key: string = Object.keys(header)[0];
            let headerValue: string = (header as any)[key];
            (request.headers as Headers).set(key, headerValue);
        });
    }

    public request(url: string | Request, options?: RequestOptionsArgs): Observable<Response> {
        if (typeof url === 'string') {
            return this.get(url, options); // Recursion: transform url from String to Request
        }
        // else if ( ! url instanceof Request ) {
        //   throw new Error('First argument must be a url string or Request instance.');
        // }

        // from this point url is always an instance of Request;
        let req: Request = url as Request;
        let token: string | Promise<string> = this.config.tokenGetter();
        if (token instanceof Promise) {
            return Observable.fromPromise(token).mergeMap((token: string) => this.requestWithToken(req, token));
        } else {
            return this.requestWithToken(req, token);
        }
    }

    public get(url: string, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: '', method: RequestMethod.Get, url: url}, options);
    }

    public post(url: string, body: any, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: body, method: RequestMethod.Post, url: url}, options);
    }

    public put(url: string, body: any, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: body, method: RequestMethod.Put, url: url}, options);
    }

    public delete(url: string, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: '', method: RequestMethod.Delete, url: url}, options);
    }

    public patch(url: string, body: any, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: body, method: RequestMethod.Patch, url: url}, options);
    }

    public head(url: string, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: '', method: RequestMethod.Head, url: url}, options);
    }

    public options(url: string, options?: RequestOptionsArgs): Observable<Response> {
        return this.requestHelper({body: '', method: RequestMethod.Options, url: url}, options);
    }

}

/**
 * Helper class to decode and find token expiration.
 */

export class AuthHelper {

    public isTokenExpired(offsetSeconds?: number): boolean {
        let date = Number(localStorage.getItem(AuthConfigConsts.DEFAULT_EXPIRY_NAME));
        offsetSeconds = offsetSeconds || 0;

        if (date == null) {
            return false;
        }

        // Token expired?
        return !(date.valueOf() > (new Date().valueOf() + (offsetSeconds * 1000)));
    }
}

/**
 * Checks for presence of token and that token hasn't expired.
 * For use with the @CanActivate router decorator and NgIf
 */

export function tokenNotExpired(tokenName = AuthConfigConsts.DEFAULT_TOKEN_NAME): boolean {

    const token: string = localStorage.getItem(tokenName);

    const authHelper = new AuthHelper();

    return token != null && !authHelper.isTokenExpired();
}

export const AUTH_PROVIDERS: Provider[] = [
    {
        provide: AuthHttp,
        deps: [Http, RequestOptions],
        useFactory: (http: Http, options: RequestOptions) => {
            return new AuthHttp(new AuthConfig(), http, options);
        }
    }
];

export function provideAuth(config?: IAuthConfigOptional): Provider[] {
    return [
        {
            provide: AuthHttp,
            deps: [Http, RequestOptions],
            useFactory: (http: Http, options: RequestOptions) => {
                return new AuthHttp(new AuthConfig(config), http, options);
            }
        }
    ];
}

let hasOwnProperty = Object.prototype.hasOwnProperty;
let propIsEnumerable = Object.prototype.propertyIsEnumerable;

function toObject(val: any) {
    if (val === null || val === undefined) {
        throw new TypeError('Object.assign cannot be called with null or undefined');
    }

    return Object(val);
}

function objectAssign(target: any, ...source: any[]) {
    let from: any;
    let to = toObject(target);
    let symbols: any;

    for (var s = 1; s < arguments.length; s++) {
        from = Object(arguments[s]);

        for (var key in from) {
            if (hasOwnProperty.call(from, key)) {
                to[key] = from[key];
            }
        }

        if ((<any>Object).getOwnPropertySymbols) {
            symbols = (<any>Object).getOwnPropertySymbols(from);
            for (var i = 0; i < symbols.length; i++) {
                if (propIsEnumerable.call(from, symbols[i])) {
                    to[symbols[i]] = from[symbols[i]];
                }
            }
        }
    }
    return to;
}

/**
 * Module for angular2-auth
 * @experimental
 */
@NgModule({
    imports: [HttpModule],
    providers: [AuthHttp, AuthHelper]
})
export class AuthModule {
    constructor(@Optional() @SkipSelf() parentModule: AuthModule) {
        if (parentModule) {
            throw new Error(
                'AuthModule is already loaded. Import it in the AppModule only');
        }
    }

    static forRoot(config: AuthConfig): ModuleWithProviders {
        return {
            ngModule: AuthModule,
            providers: [
                {provide: AuthConfig, useValue: config}
            ]
        };
    }
}