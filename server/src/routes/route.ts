import { Express, Request, Response } from 'express';
import { Authentication, AUTHENTICATION_LEVEL } from '../../shared/models/db-user';
import { UserSession } from '../authentication/session-util';
import { errorHandler } from '../errors/error-handler';


export interface UserInfo {
    userid: string;
    username: string;
    authentication: Authentication;
}

export class RouteError extends Error {
    constructor(
        public readonly status: number,
        message: string
    ) {
        super(message);
    }
}

export class Redirect {
    constructor(
        public readonly path: string
    ) {}
}

abstract class Route {
    public abstract readonly route: string;
    protected readonly authentication: Authentication = Authentication.NONE;

    constructor(
        protected readonly app: Express,
    ) {
    }

    protected abstract getExpressMethod(): any;
    protected abstract run(user: UserInfo | undefined, pathParams: any, queryParams: any, bodyParams: any): Promise<any | Redirect>;

    public register() {

        // register the route
        this.getExpressMethod()(this.route, async (req: Request, res: Response) => {
            try {

                // Get the logged in user info
                const user = this.authenticateUser(req, res);
                if (!user && this.authentication !== Authentication.NONE) {
                    res.status(401).send({error: "You are not logged in!"});
                    return;
                }

                // Check if user has permission to access this route
                const userAuthLevel = AUTHENTICATION_LEVEL[user?.authentication ?? Authentication.NONE];
                const routeAuthLevel = AUTHENTICATION_LEVEL[this.authentication];
                if (userAuthLevel < routeAuthLevel) {
                    res.status(403).send({error: "You do not have permission to access this resource!"});
                    return;
                }

                // Run the route
                const response: any = await this.run(user, req.params, req.query, req.body);

                if (response instanceof Redirect) {
                    res.redirect(response.path);
                    return;
                }
                
                // Send successful response
                res.status(200).send(response);

            } catch (e: any) {

                // If there is a RouteError, send the error message with the status code
                if (e instanceof RouteError) {
                    res.status(e.status).send({error: e.message});
                    return;
                }
                
                // Otherwise, this is an unexpected error. Send a 500 error
                errorHandler.logError(e, this.constructor.name);
                res.status(500).send({error: e.message});
            }
        });
    }

    // return user info. If not logged in, return undefined
    private authenticateUser(req: Request, res: Response): UserInfo | undefined {

        if (!req.session) return undefined;
        
        const userSession = req.session as UserSession;
        const permission = userSession.permission;

        if (permission === Authentication.NONE || !userSession.userid || !userSession.username) return undefined;

        return {
            userid: userSession.userid,
            username: userSession.username,
            authentication: permission
        };
    }
}

export abstract class GetRoute<T extends {} = {}> extends Route {

    /**
     * Define the get method for the route
     * @param user The logged in user, or undefined if not logged in
     * @param queryParams The query parameters from the request
     * @throws RouteError if there is an error
     */
    public abstract get(user: UserInfo | undefined, pathParams: any, queryParams: any): Promise<T | Redirect>;

    protected override async run(user: UserInfo | undefined, pathParams: any, queryParams: any, bodyParams: {}): Promise<T | Redirect> {
        return await this.get(user, pathParams, queryParams);
    }

    protected override getExpressMethod() {
        return this.app.get.bind(this.app);
    }
}

export abstract class PostRoute<T extends {} = {}> extends Route {

    /**
     * Define the post method for the route
     * @param user The logged in user, or undefined if not logged in
     * @param queryParams The query parameters from the request
     * @param bodyParams The body parameters from the request
     */
    public abstract post(user: UserInfo | undefined, pathParams: any, queryParams: any, bodyParams: any): Promise<T | Redirect>;

    protected override async run(user: UserInfo | undefined, pathParams: any, queryParams: any, bodyParams: any): Promise<T | Redirect> {
        return await this.post(user, pathParams, queryParams, bodyParams);
    }

    protected override getExpressMethod() {
        return this.app.post.bind(this.app);
    }
}

// Managers registering all routes
export class RouteManager {

    // Map of route class names to consumer instances
    private routes = new Map<string, any>();

    constructor(
        private readonly app: Express
    ) {}

    // Register a new route
    // Takes in a class that extends Route, and creates a new instance of it
    public registerRoute(
        routeClass: new (app: Express) => Route
    ) {

        // Instantiate consumer object
        const route = new routeClass(this.app);

        // Assert consumer is not already registered
        if (this.routes.has(route.route)) {
            throw new Error(`Route ${route.route} is already registered`);
        }

        // Register route
        route.register();
        this.routes.set(route.route, route);
        console.log(`Registered route: ${route.route}`);
    }
}