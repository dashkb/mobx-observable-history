import { intercept, observable, reaction, transaction } from "mobx";
import { createBrowserHistory, createLocation, createPath, locationsAreEqual } from "history";
import { URLSearchParamsExtended } from "./search-params";
export function createObservableHistory(history = createBrowserHistory(), options = {}) {
    const disposers = [];
    const data = observable({
        action: history.action,
        location: observable.object(history.location, {
            state: observable.struct
        }),
        searchParams: createSearchParams(),
    });
    function createSearchParams(search = history.location.search) {
        return URLSearchParamsExtended.create(search, options.searchParams, syncSearchParams);
    }
    function syncSearchParams(search) {
        if (data.location.search !== normalize(data.searchParams.toString())) {
            data.location.search = search;
            data.searchParams = createSearchParams(search);
        }
    }
    function setLocation(location) {
        if (typeof location === "string") {
            location = createLocation(location);
        }
        if (!locationsAreEqual(data.location, location)) {
            transaction(() => {
                Object.assign(data.location, location);
            });
        }
    }
    function normalize(chunk, prefix = "?") {
        chunk = String(chunk).trim();
        if (!chunk || chunk == prefix)
            return "";
        if (chunk.startsWith(prefix))
            return chunk;
        return prefix + chunk;
    }
    disposers.push(
    // update search-params object
    reaction(() => data.location.search, syncSearchParams), 
    // update url when history.location modified directly
    reaction(() => createPath(data.location), path => {
        let historyPath = createPath(history.location);
        if (historyPath !== path) {
            history.push(createLocation(path));
        }
    }), 
    // normalize values for direct updates of history.location
    intercept(data.location, change => {
        if (change.type === "update") {
            switch (change.name) {
                case "search":
                    change.newValue = normalize(change.newValue, "?");
                    break;
                case "hash":
                    change.newValue = normalize(change.newValue, "#");
                    break;
            }
        }
        return change;
    }), 
    // update observables from history change event
    history.listen((location, action) => {
        data.action = action;
        setLocation(location);
    }));
    return Object.create(history, {
        action: {
            configurable: true,
            get() {
                return data.action;
            }
        },
        location: {
            configurable: true,
            set: setLocation,
            get() {
                return data.location;
            }
        },
        searchParams: {
            configurable: true,
            get() {
                return data.searchParams;
            },
            set(value) {
                data.location.search = String(value);
            },
        },
        getPath: {
            value() {
                return createPath(data.location);
            }
        },
        merge: {
            value(newLocation, replace = false) {
                if (typeof newLocation === "string") {
                    newLocation = createLocation(newLocation);
                    Object.entries(newLocation).forEach(([param, value]) => {
                        if (!value) {
                            // @ts-ignore remove empty strings from parsed location
                            delete newLocation[param];
                        }
                    });
                }
                newLocation = { ...data.location, ...newLocation };
                if (replace)
                    history.replace(newLocation);
                else
                    history.push(newLocation);
            }
        },
        destroy: {
            value() {
                disposers.forEach(dispose => dispose());
                delete this.location;
                delete this.action;
                delete this.searchParams;
                return Object.getPrototypeOf(this);
            }
        }
    });
}
