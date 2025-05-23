import { Observable, Subject } from "rxjs";
import { DBError, DBObjectAlreadyExistsError, DBObjectNotFoundError } from "./db-object-error";
import { DBCacheMonitor } from "./db-cache-monitor";

/**
 * A DBObject interfaces in-memory storage of a database object with reading and writing to the database. Subclasses
 * implement how to fetch the object from the database, and how to alter the object both in-memory and in the database. So,
 * external code can fetch and manipulate the object quickly and without worrying about synchronizing with the database.
 * 
 * To subclass, call DBObject<Object, Event>() with the schema of the object and an enum of events that can be emitted to alter. Abstract
 * class is wrapped in a function to allow for generic static properties and methods.
 * 
 * Subclass DBObject only if database data for the object is modified only through your subclass. If the object is modified in the database
 * by other means, the in-memory object will be out of sync with the database which can lead to undefined behavior.
 * 
 * @param name The name of the object, used for logging and debugging
 * @param maxCacheSize The maximum number of objects to cache in-memory. If the number of objects exceeds this, the least recently used object will be removed.
 * @template InMemoryObject The schema of the in-memory object
 * @template CreateParams The parameters needed to create the object
 * @template Event An enum of events that can be emitted to alter the object
 */
export function DBObject<InMemoryObject extends {}, CreateParams, Event>(name: string, maxCacheSize: number = 1000) {

    // Ensure maxCacheSize is valid
    if (maxCacheSize < 0) throw new Error("maxCacheSize must be nonnegative");

    /**
     * Represents a change to a database object
     */
    interface DBObjectChange {
        id: string;
        before: InMemoryObject;
        after: InMemoryObject;
        event: Event;
    }

    interface DBObjectWithID {
        id: string;
        object: InMemoryObject;
    }

    abstract class DBObject {

        // A map of all objects, indexed by their ID. It is ordered by the order of creation.
        private static dbObjects = new Map<string, DBObject>();

        // A list of subscribers to create/delete/changes in the database objects
        private static onCreate$ = new Subject<DBObjectWithID>();
        private static onDelete$ = new Subject<DBObjectWithID>();
        private static onChange$ = new Subject<DBObjectChange>();


        // The maximum number of objects to cache in-memory. If the number of objects exceeds this, the least recently used object will be removed.
        private static cacheSize = 0;

        /**
         * Evicts the oldest object from the cache if the cache size exceeds the maximum cache size.
         */
        private static evictOldestIfNeeded() {

            if (DBObject.cacheSize >= maxCacheSize && DBObject.dbObjects.size > 0) {

                // Get the id of the oldest object
                const oldestID = DBObject.dbObjects.keys().next().value!;

                // Delete the object from the map to free up memory
                DBObject.dbObjects.delete(oldestID);
                DBObject.cacheSize--;
                DBCacheMonitor.setNumCacheEntries(name, DBObject.cacheSize);

                console.log(`Evicted ${name} object with ID ${oldestID} from cache to free up memory`);
            }
        }

        /**
         * Creates a new object, both in-memory and in the database. Blocks until the object is fully created.
         * use like: await CustomDBObject.create(id, newObject);
         * @returns The newly created object
         * @throws DBError
         */
        static async create<T extends DBObject>(this: new (id: string) => T, id: string, params: CreateParams): Promise<InMemoryObject> {

            // If the object already exists, throw an error
            if (DBObject.dbObjects.has(id)) {
                throw new DBObjectAlreadyExistsError(`Object with ID ${id} already exists`);
            }

            // Construct the new DBObject
            const dbObject = new this(id);

            // Store the in-memory object into dbObject and create the object in the database. Blocks until the object is created
            const newObject = await dbObject.create(params);

            // Store the object in the map
            DBObject.dbObjects.set(id, dbObject);
            DBObject.cacheSize++;
            DBCacheMonitor.setNumCacheEntries(name, DBObject.cacheSize);

            console.log(`Created new ${name} object with ID ${id}`);

            // Evict the oldest object if the cache size exceeds the maximum cache size
            DBObject.evictOldestIfNeeded();

            // Notify all subscribers of the creation
            DBObject.onCreate$.next({
                id: id,
                object: newObject
            });

            // Return the in-memory object
            return newObject;
        }

         /**
         * Completely deletes the object from the database and in-memory. Blocks until the object is fully deleted.
         * @param id The ID of the object to delete
         * @param waitForDB If true, the method will wait for the database to finish writing before returning. Otherwise, only in-memory delete is guaranteed.
         * @throws DBError
         */
        static async delete<T extends DBObject>(this: new (id: string) => T, id: string, waitForDB: boolean): Promise<void> {
            
            // First, fetch the object
            const dbObject = await DBObject.getDBObject.call(this, id);

            // Get a copy of the in-memory object before deleting
            const before: InMemoryObject = Object.assign({}, dbObject.get());

            // Delete the object from the database
            if (waitForDB) await dbObject.deleteFromDatabase(id);
            else dbObject.deleteFromDatabase(id).catch(console.error);

            // Delete the in-memory object by deleting the object from the map
            DBObject.dbObjects.delete(id);
            DBObject.cacheSize--;
            DBCacheMonitor.setNumCacheEntries(name, DBObject.cacheSize);

            // Notify all subscribers of the deletion
            DBObject.onDelete$.next({
                id: id,
                object: before
            });

            console.log(`Deleted ${name} object with ID ${id}`);
        }
        

        /**
         * Alters a specific object given id, both in-memory and in the database.
         * @param id The ID of the object to alter
         * @param event The event to alter the object with
         * @param waitForDB If true, the method will wait for the database to finish writing before returning. Otherwise, only in-memory alter is guaranteed.
         * @returns The altered object
         * @throws DBError if the object does not exist
         */
        static async alter<T extends DBObject>(this: new (id: string) => T, id: string, event: Event, waitForDB: boolean): Promise<InMemoryObject> {

            // Fetch the object
            const dbObject = await DBObject.getDBObject.call(this, id);

            // Get a copy of the in-memory object before altering
            const before: InMemoryObject = Object.assign({}, dbObject.get());

            // Alter the object in-memory and in the database. If waitForDB is true, wait for the database to finish writing before returning
            await dbObject.alter(event, waitForDB);

            // Get a copy of the in-memory object after altering
            const after: InMemoryObject = Object.assign({}, dbObject.get());

            //console.log(`Altered ${name} object with ID ${id} with event ${event}`);

            // Notify all subscribers of the change
            DBObject.onChange$.next({
                id: id,
                before: before,
                after: after,
                event: event
            });

            // Return the altered object
            return after;
        }

        /**
         * Gets the in-memory DBObject for a given id. However, if the object is not in-memory, it will fetch the object from the database, then
         * cache it in-memory. Blocks until the object is fetched.
         * 
         * This will be fast if the object is already in-memory, but slow if the object is not in-memory.
         * @param id The ID of the object to get
         * @returns The in-memory object, whether it was cached, and the time it took to fetch the object
         * @throws DBError
         */
        private static async getDBObject<T extends DBObject>(this: new (id: string) => T, id: string): Promise<DBObject> {

            const start = Date.now();

            // Try to fetch the object from the map, if it exists
            const existingDBObject = DBObject.dbObjects.get(id);

            // If the object is in-memory, return the in-memory object
            if (existingDBObject) {
                // Notify the cache monitor of the cache hit
                DBCacheMonitor.recordCacheHit(name);

                return existingDBObject;
            }

            // We need to fetch the object from the database. Construct the object for the desired id and sync with database to get the data
            const dbObject = new this(id);
            await dbObject.sync();

            // Store the object in the map so that future calls to get() will be fast
            DBObject.dbObjects.set(id, dbObject);
            DBObject.cacheSize++;
            DBCacheMonitor.setNumCacheEntries(name, DBObject.cacheSize);

            // Evict the oldest object if the cache size exceeds the maximum cache size
            DBObject.evictOldestIfNeeded();

            // Notify the cache monitor of the cache miss
            const ms = Date.now() - start;
            DBCacheMonitor.recordCacheMiss(name, ms);

            // Return the in-memory object
            return dbObject;
        }

        /**
         * Gets the in-memory InMemoryObject for a given id. However, if the object is not in-memory, it will fetch the object from the database, then
         * cache it in-memory. Blocks until the object is fetched.
         * 
         * This will be fast if the object is already in-memory, but slow if the object is not in-memory.
         * @param id The ID of the object to get
         * @returns The in-memory object, whether it was cached, and the time it took to fetch the object
         * @throws DBError if the object does not exist
         */
        static async get<T extends DBObject>(this: new (id: string) => T, id: string): Promise<InMemoryObject> {
            const dbObject = await DBObject.getDBObject.call(this, id);
            return dbObject.get();
        }

        /**
         * Gets the object from the cache or the database, otherwise returns null if the object does not exist.
         * @param id The ID of the object to get
         * @returns The in-memory object, or null if the object does not exist
         */
        static async getOrNull<T extends DBObject>(this: new (id: string) => T, id: string): Promise<InMemoryObject | null> {
            try {
                return await DBObject.get.call(this, id);
            } catch (error: any) {
                if (error instanceof DBObjectNotFoundError) {
                    return null;
                } else {
                    throw error;
                }
            }
        }

        /**
         * "Forget" the object by removing it from the map, and thus removing it from in-memory. The object will still exist in the database. This
         * is useful if the object is no longer needed, and we want to free up memory.
         * @param id 
         */
        static forget(id: string) {
            if (DBObject.dbObjects.delete(id)) {
                DBObject.cacheSize--;
                DBCacheMonitor.setNumCacheEntries(name, DBObject.cacheSize);
            }

            console.log(`Forgot ${name} object with ID ${id}`);
        }

        /**
         * Gets all in-memory objects. This is useful for debugging and monitoring.
         * @returns A map of all in-memory objects, indexed by their ID
         */
        static getAllCacheEntries() {
            return Object.fromEntries(DBObject.dbObjects);
        }

        /**
         * Removes all in-memory objects from the cache. This will not modify or delete the objects in the database. Subsequent calls to get() will
         * fetch the object from the database.
         */
        static clearCache() {
            DBObject.dbObjects.clear();
            DBObject.cacheSize = 0;
            DBCacheMonitor.clearCacheMonitor(name);

            console.log(`Cleared ${name} object cache`);
        }

        /**
         * Subscribes to changes in the database objects. Whenever an object is altered, all subscribers will be notified.
         * @param subscriber 
         */
        static onChange(): Observable<DBObjectChange> {
            return DBObject.onChange$.asObservable();
        }

        /**
         * Subscribes to creation of database objects. Whenever an object is created, all subscribers will be notified.
         * @param subscriber 
         */
        static onCreate(): Observable<DBObjectWithID> {
            return DBObject.onCreate$.asObservable();
        }

        /**
         * Subscribes to deletion of database objects. Whenever an object is deleted, all subscribers will be notified.
         * @param subscriber 
         */
        static onDelete(): Observable<DBObjectWithID> {
            return DBObject.onDelete$.asObservable();
        }

        /**
         * Check if the object exists at all, either in-memory or in the database.
         * @param id The ID of the object to check
         * @returns True if the object exists, false otherwise
         */
        static async exists<T extends DBObject>(this: new (id: string) => T, id: string): Promise<boolean> {

            // Check if the object is in-memory. If so, don't need to check the database
            if (DBObject.dbObjects.has(id)) return true;

            // Check if the object exists in the database
            const dbObject = new this(id);
            try {

                // Attempt to fetch the object from the database. If the object does not exist, DBObjectNotFoundError will be thrown
                await dbObject.fetchFromDB();

                // If an error is not thrown, the object exists
                return true;

            } catch (error: any) {

                if (error instanceof DBObjectNotFoundError) {
                    // If the object does not exist in the database, return false
                    return false;
                } else {
                    // If unknown error, throw it
                    throw error;
                }
            }
        }


        constructor(public readonly id: string) {}

        // sync() should be called immediately after construction to initialize the object
        protected inMemoryObject!: InMemoryObject;

        /**
         * Creates a new object both in the database and in-memory. Stores the parameter as the in-memory object, and also writes it to the database.
         * @param newObject The new in-memory object to create, which would be used to create the object in the database
         * @returns The newly created object
         */
        public async create(params: CreateParams): Promise<InMemoryObject> {
            this.inMemoryObject = this.createInMemory(params);
            await this.createInDatabase(this.inMemoryObject);

            return this.inMemoryObject;
        }

        /**
         * Fetches the object from the database and stores it in memory. This method should be called at initialization, and if
         * synchronization is desired.
         */
        public async sync() {
            this.inMemoryObject = await this.fetchFromDB();
        }

        /**
         * Alters the object both in-memory and in the database.
         * 
         * @param event The event to alter the object with
         * @param waitForDB If true, the method will wait for the database to finish writing before returning. Otherwise, only in-memory alter is guaranteed.
         */
        public async alter(event: Event, waitForDB: boolean) {

            const inMemoryCopy = Object.assign({}, this.inMemoryObject);

            // If altering object with event causes error, revert to old object and log error
            const revert = (error: any) => {
                console.error(
                    `Failed to alter ${name} object with ID ${this.id}, and will revert to old object\n`,
                    `Event: ${JSON.stringify(event)}\n`,
                    `Old object: ${JSON.stringify(inMemoryCopy)}\n`,
                    `New object: ${JSON.stringify(this.inMemoryObject)}\n`,
                    error
                );
                this.inMemoryObject = inMemoryCopy;
            }

            // First, alter the object in-memory
            this.alterInMemory(event);

            // Second, update database. If waitForDB is true, wait for the database to finish writing before returning
            const saveToDatabase = this.saveToDatabase();
            if (waitForDB) {
                try { await saveToDatabase; }
                catch (error: any) { revert(error); }
            } else saveToDatabase.catch((error) => revert(error));
        }

        /**
         * Gets the in-memory object without fetching from the database.
         * @returns The in-memory object
         */
        public get(): InMemoryObject {
            return this.inMemoryObject;
        }

        /**
         * Fetches the object from the database
         * @returns The object fetched from the database
         * @throws DBError, will throw an DBObjectNotFoundError if the object does not exist in the database
         */
        protected abstract fetchFromDB(): Promise<InMemoryObject>;

        // Save updated InMemoryObject to the database. Note that this should not create a new object, but update an existing one.
        protected abstract saveToDatabase(): Promise<void>;

        // Given parameters, create the object in-memory
        protected abstract createInMemory(params: CreateParams): InMemoryObject;

        // Given the newly-created in-memory object, create a new entry in the database
        protected abstract createInDatabase(newObject: InMemoryObject): Promise<void>;

        // Completely deletes the object with given id from the database
        protected abstract deleteFromDatabase(id: string): Promise<void>;
        
        // Given an event, alters the object in-memory
        protected abstract alterInMemory(event: Event): void;
    }

    return DBObject;
}
