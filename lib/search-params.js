export class URLSearchParamsExtended {
    static create(search, init = {}, onChange) {
        let searchParams = new URLSearchParams(search);
        let searchParamsExtras = Object.getOwnPropertyDescriptors(URLSearchParamsExtended.prototype);
        delete searchParamsExtras.constructor;
        Object.defineProperties(searchParams, searchParamsExtras);
        URLSearchParamsExtended.defaultOptions.set(searchParams, {
            defaultMergeOptions: Object.assign({
                joinArrays: true,
                joinArraysWith: ",",
                skipEmptyValues: true,
            }, init.defaultMergeOptions),
            defaultStringifyOptions: Object.assign({
                encoder: encodeURI,
                withPrefix: false,
            }, init.defaultStringifyOptions)
        });
        if (!onChange) {
            return searchParams;
        }
        return new Proxy(searchParams, {
            get(target, prop, context) {
                let keyRef = Reflect.get(target, prop, context);
                if (typeof keyRef === "function") {
                    return (...args) => {
                        let oldValue = target.toString();
                        let result = Reflect.apply(keyRef, target, args);
                        let newValue = target.toString();
                        if (oldValue !== target.toString())
                            onChange(newValue);
                        return result;
                    };
                }
                return keyRef;
            }
        });
    }
    getAsArray(name, splitter) {
        const { joinArraysWith } = URLSearchParamsExtended.defaultOptions.get(this).defaultMergeOptions;
        splitter = splitter || joinArraysWith;
        const data = this.get(name);
        return data ? data.split(splitter) : [];
    }
    merge(params, options) {
        const copy = this.copyWith(params, options);
        Array.from(this.keys()).forEach(key => this.delete(key));
        Array.from(copy.entries()).forEach(([key, value]) => this.append(key, value));
    }
    copyWith(params, options = {}) {
        const copyInit = Object.assign({}, URLSearchParamsExtended.defaultOptions.get(this));
        copyInit.defaultMergeOptions = {
            ...copyInit.defaultMergeOptions,
            ...options,
        };
        const copy = URLSearchParamsExtended.create(this, copyInit);
        if (!params) {
            return copy;
        }
        const { joinArrays, joinArraysWith, skipEmptyValues } = copyInit.defaultMergeOptions;
        Object.entries(params).forEach(([name, value]) => {
            copy.delete(name);
            if (Array.isArray(value)) {
                if (skipEmptyValues && !value.length)
                    return;
                if (joinArrays)
                    copy.append(name, value.join(joinArraysWith));
                else
                    value.forEach(val => copy.append(name, val));
            }
            else {
                if (value == null)
                    value = "";
                if (skipEmptyValues && !String(value).length)
                    return;
                copy.append(name, value);
            }
        });
        return copy;
    }
    toString(options = {}) {
        const { encoder, withPrefix } = {
            ...URLSearchParamsExtended.defaultOptions.get(this).defaultStringifyOptions,
            ...options
        };
        const prefix = withPrefix ? "?" : "";
        if (encoder === encodeURIComponent) {
            return prefix + URLSearchParams.prototype.toString.call(this);
        }
        else {
            return prefix + Array.from(this)
                .map(([key, value]) => `${key}=${encoder(value)}`)
                .join("&");
        }
    }
}
URLSearchParamsExtended.defaultOptions = new WeakMap();
