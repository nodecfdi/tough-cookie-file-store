import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { inspect } from 'node:util';
import { type Callback, Cookie, type Nullable, pathMatch, permuteDomain, Store } from 'tough-cookie';
import { createPromiseCallback, type ErrorCallback } from 'tough-cookie/dist/utils.js';

export type FileCookieStoreIndex = {
  [domain: string]:
    | {
        [path: string]:
          | {
              [key: string]: Cookie | undefined;
            }
          | undefined;
      }
    | undefined;
};

export class FileCookieStore extends Store {
  public override synchronous: boolean;

  /**
   * @internal
   */
  public idx: FileCookieStoreIndex;

  public filePath: string;

  public constructor(filePath: string) {
    super();
    this.synchronous = true;
    this.idx = Object.create(null);
    this.filePath = filePath;
    this._loadFromFile();
  }

  /**
   * Retrieve a {@link Cookie} with the given `domain`, `path`, and `key` (`name`). The RFC maintains that exactly
   * one of these cookies should exist in a store. If the store is using versioning, this means that the latest or
   * newest such cookie should be returned.
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param key - The cookie name to match against.
   */
  public override findCookie(
    domain: Nullable<string>,
    path: Nullable<string>,
    key: Nullable<string>,
  ): Promise<Cookie | undefined>;
  /**
   * Retrieve a {@link Cookie} with the given `domain`, `path`, and `key` (`name`). The RFC maintains that exactly
   * one of these cookies should exist in a store. If the store is using versioning, this means that the latest or
   * newest such cookie should be returned.
   *
   * Callback takes an error and the resulting Cookie object. If no cookie is found then null MUST be passed instead (that is, not an error).
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param key - The cookie name to match against.
   * @param callback - A function to call with either the found cookie or an error.
   */
  public override findCookie(
    domain: Nullable<string>,
    path: Nullable<string>,
    key: Nullable<string>,
    callback: Callback<Cookie | undefined>,
  ): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override findCookie(
    domain: Nullable<string>,
    path: Nullable<string>,
    key: Nullable<string>,
    callback?: Callback<Cookie | undefined>,
  ): unknown {
    const promiseCallback = createPromiseCallback(callback);
    if (!domain || !path || !key) {
      return promiseCallback.resolve(undefined);
    }

    const result = this.idx[domain]?.[path]?.[key];

    return promiseCallback.resolve(result);
  }

  /**
   * Locates all {@link Cookie} values matching the given `domain` and `path`.
   *
   * The resulting list is checked for applicability to the current request according to the RFC (`domain-match`, `path-match`,
   * `http-only-flag`, `secure-flag`, `expiry`, and so on), so it's OK to use an optimistic search algorithm when implementing
   * this method. However, the search algorithm used SHOULD try to find cookies that {@link domainMatch} the `domain` and
   * {@link pathMatch} the `path` in order to limit the amount of checking that needs to be done.
   *
   * @remarks
   * - As of version `0.9.12`, the `allPaths` option to cookiejar.getCookies() above causes the path here to be `null`.
   *
   * - If the `path` is `null`, `path-matching` MUST NOT be performed (that is, `domain-matching` only).
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param allowSpecialUseDomain - If `true` then special-use domain suffixes, will be allowed in matches. Defaults to `false`.
   */
  public override findCookies(
    domain: string,
    path: Nullable<string>,
    allowSpecialUseDomain?: boolean,
  ): Promise<Cookie[]>;
  /**
   * Locates all {@link Cookie} values matching the given `domain` and `path`.
   *
   * The resulting list is checked for applicability to the current request according to the RFC (`domain-match`, `path-match`,
   * `http-only-flag`, `secure-flag`, `expiry`, and so on), so it's OK to use an optimistic search algorithm when implementing
   * this method. However, the search algorithm used SHOULD try to find cookies that {@link domainMatch} the `domain` and
   * {@link pathMatch} the `path` in order to limit the amount of checking that needs to be done.
   *
   * @remarks
   * - As of version `0.9.12`, the `allPaths` option to cookiejar.getCookies() above causes the path here to be `null`.
   *
   * - If the `path` is `null`, `path-matching` MUST NOT be performed (that is, `domain-matching` only).
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param allowSpecialUseDomain - If `true` then special-use domain suffixes, will be allowed in matches. Defaults to `false`.
   * @param callback - A function to call with either the found cookies or an error.
   */
  public override findCookies(
    domain: string,
    path: Nullable<string>,
    allowSpecialUseDomain?: boolean,
    callback?: Callback<Cookie[]>,
  ): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override findCookies(
    domain: string,
    path: Nullable<string>,
    allowSpecialUseDomain: boolean | Callback<Cookie[]> = false,
    callback?: Callback<Cookie[]>,
  ): unknown {
    if (typeof allowSpecialUseDomain === 'function') {
      callback = allowSpecialUseDomain;
      allowSpecialUseDomain = true;
    }

    const results: Cookie[] = [];
    const promiseCallback = createPromiseCallback<Cookie[]>(callback);

    if (!domain) {
      return promiseCallback.resolve([]);
    }

    let pathMatcher: (domainIndex: FileCookieStoreIndex[string] | undefined) => void;

    // eslint-disable-next-line unicorn/prefer-ternary
    if (path) {
      pathMatcher = function matchRFC(domainIndex): void {
        //NOTE: we should use path-match algorithm from S5.1.4 here
        //(see : https://github.com/ChromiumWebApps/chromium/blob/b3d3b4da8bb94c1b2e061600df106d590fda3620/net/cookies/canonical_cookie.cc#L299)
        for (const cookiePath in domainIndex) {
          if (pathMatch(path, cookiePath)) {
            const pathIndex = domainIndex[cookiePath];
            for (const key in pathIndex) {
              const value = pathIndex[key];
              if (value) {
                results.push(value);
              }
            }
          }
        }
      };
    } else {
      // null means "all paths"
      pathMatcher = function matchAll(domainIndex): void {
        for (const curPath in domainIndex) {
          const pathIndex = domainIndex[curPath];
          for (const key in pathIndex) {
            const value = pathIndex[key];
            if (value) {
              results.push(value);
            }
          }
        }
      };
    }

    const domains = permuteDomain(domain, allowSpecialUseDomain) ?? [domain];
    const { idx } = this;
    for (const curDomain of domains) {
      const domainIndex = idx[curDomain];
      if (!domainIndex) {
        continue;
      }
      pathMatcher(domainIndex);
    }

    return promiseCallback.resolve(results);
  }

  /**
   * Adds a new {@link Cookie} to the store. The implementation SHOULD replace any existing cookie with the same `domain`,
   * `path`, and `key` properties.
   *
   * @remarks
   * - Depending on the nature of the implementation, it's possible that between the call to `fetchCookie` and `putCookie`
   * that a duplicate `putCookie` can occur.
   *
   * - The {@link Cookie} object MUST NOT be modified; as the caller has already updated the `creation` and `lastAccessed` properties.
   *
   * @param cookie - The cookie to store.
   */
  public override putCookie(cookie: Cookie): Promise<void>;
  /**
   * Adds a new {@link Cookie} to the store. The implementation SHOULD replace any existing cookie with the same `domain`,
   * `path`, and `key` properties.
   *
   * @remarks
   * - Depending on the nature of the implementation, it's possible that between the call to `fetchCookie` and `putCookie`
   * that a duplicate `putCookie` can occur.
   *
   * - The {@link Cookie} object MUST NOT be modified; as the caller has already updated the `creation` and `lastAccessed` properties.
   *
   * @param cookie - The cookie to store.
   * @param callback - A function to call when the cookie has been stored or an error has occurred.
   */
  public override putCookie(cookie: Cookie, callback: ErrorCallback): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override putCookie(cookie: Cookie, callback?: ErrorCallback): unknown {
    const promiseCallback = createPromiseCallback<undefined>(callback);

    const { domain, path, key } = cookie;
    if (!domain || !path || !key) {
      return promiseCallback.resolve(undefined);
    }

    const domainEntry: NonNullable<FileCookieStoreIndex[string]> = this.idx[domain] ?? Object.create(null);
    this.idx[domain] = domainEntry;

    const pathEntry: NonNullable<(typeof domainEntry)[string]> = domainEntry[path] ?? Object.create(null);
    domainEntry[path] = pathEntry;

    pathEntry[key] = cookie;

    this._saveToFile();

    return promiseCallback.resolve(undefined);
  }

  /**
   * Update an existing {@link Cookie}. The implementation MUST update the `value` for a cookie with the same `domain`,
   * `path`, and `key`. The implementation SHOULD check that the old value in the store is equivalent to oldCookie -
   * how the conflict is resolved is up to the store.
   *
   * @remarks
   * - The `lastAccessed` property is always different between the two objects (to the precision possible via JavaScript's clock).
   *
   * - Both `creation` and `creationIndex` are guaranteed to be the same.
   *
   * - Stores MAY ignore or defer the `lastAccessed` change at the cost of affecting how cookies are selected for automatic deletion.
   *
   * - Stores may wish to optimize changing the `value` of the cookie in the store versus storing a new cookie.
   *
   * - The `newCookie` and `oldCookie` objects MUST NOT be modified.
   *
   * @param oldCookie - the cookie that is already present in the store.
   * @param newCookie - the cookie to replace the one already present in the store.
   */
  public override updateCookie(oldCookie: Cookie, newCookie: Cookie): Promise<void>;
  /**
   * Update an existing {@link Cookie}. The implementation MUST update the `value` for a cookie with the same `domain`,
   * `path`, and `key`. The implementation SHOULD check that the old value in the store is equivalent to oldCookie -
   * how the conflict is resolved is up to the store.
   *
   * @remarks
   * - The `lastAccessed` property is always different between the two objects (to the precision possible via JavaScript's clock).
   *
   * - Both `creation` and `creationIndex` are guaranteed to be the same.
   *
   * - Stores MAY ignore or defer the `lastAccessed` change at the cost of affecting how cookies are selected for automatic deletion.
   *
   * - Stores may wish to optimize changing the `value` of the cookie in the store versus storing a new cookie.
   *
   * - The `newCookie` and `oldCookie` objects MUST NOT be modified.
   *
   * @param oldCookie - the cookie that is already present in the store.
   * @param newCookie - the cookie to replace the one already present in the store.
   * @param callback - A function to call when the cookie has been updated or an error has occurred.
   */
  public override updateCookie(oldCookie: Cookie, newCookie: Cookie, callback: ErrorCallback): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override updateCookie(_oldCookie: Cookie, newCookie: Cookie, callback?: ErrorCallback): unknown {
    // updateCookie() may avoid updating cookies that are identical.  For example,
    // lastAccessed may not be important to some stores and an equality
    // comparison could exclude that field.
    // Don't return a value when using a callback, so that the return type is truly "void"
    if (callback) {
      this.putCookie(newCookie, callback);

      return;
    }

    return this.putCookie(newCookie);
  }

  /**
   * Remove a cookie from the store (see notes on `findCookie` about the uniqueness constraint).
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param key - The cookie name to match against.
   */
  public override removeCookie(domain: string, path: string, key: string): Promise<void>;
  /**
   * Remove a cookie from the store (see notes on `findCookie` about the uniqueness constraint).
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param key - The cookie name to match against.
   * @param callback - A function to call when the cookie has been removed or an error occurs.
   */
  public override removeCookie(domain: string, path: string, key: string, callback: ErrorCallback): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override removeCookie(domain: string, path: string, key: string, callback?: ErrorCallback): unknown {
    const promiseCallback = createPromiseCallback<undefined>(callback);
    delete this.idx[domain]?.[path]?.[key];

    this._saveToFile();

    return promiseCallback.resolve(undefined);
  }

  /**
   * Removes matching cookies from the store. The `path` parameter is optional and if missing,
   * means all paths in a domain should be removed.
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   */
  public override removeCookies(domain: string, path: Nullable<string>): Promise<void>;
  /**
   * Removes matching cookies from the store. The `path` parameter is optional and if missing,
   * means all paths in a domain should be removed.
   *
   * @param domain - The cookie domain to match against.
   * @param path - The cookie path to match against.
   * @param callback - A function to call when the cookies have been removed or an error occurs.
   */
  public override removeCookies(domain: string, path: Nullable<string>, callback: ErrorCallback): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override removeCookies(domain: string, path: Nullable<string>, callback?: ErrorCallback): unknown {
    const promiseCallback = createPromiseCallback<undefined>(callback);

    const domainEntry = this.idx[domain];
    if (domainEntry) {
      if (path) {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete domainEntry[path];
      } else {
        // eslint-disable-next-line @typescript-eslint/no-dynamic-delete
        delete this.idx[domain];
      }
    }

    this._saveToFile();

    return promiseCallback.resolve(undefined);
  }

  /**
   * Removes all cookies from the store.
   */
  public override removeAllCookies(): Promise<void>;
  /**
   * Removes all cookies from the store.
   *
   * @param callback - A function to call when all the cookies have been removed or an error occurs.
   */
  public override removeAllCookies(callback: ErrorCallback): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override removeAllCookies(callback?: ErrorCallback): unknown {
    const promiseCallback = createPromiseCallback<undefined>(callback);
    this.idx = Object.create(null) as FileCookieStoreIndex;

    this._saveToFile();

    return promiseCallback.resolve(undefined);
  }

  /**
   * Gets all the cookies in the store.
   *
   * @remarks
   * - Cookies SHOULD be returned in creation order to preserve sorting via {@link cookieCompare}.
   */
  public override getAllCookies(): Promise<Cookie[]>;
  /**
   * Gets all the cookies in the store.
   *
   * @remarks
   * - Cookies SHOULD be returned in creation order to preserve sorting via {@link cookieCompare}.
   *
   * @param callback - A function to call when all the cookies have been retrieved or an error occurs.
   */
  public override getAllCookies(callback: Callback<Cookie[]>): void;
  /**
   * @internal No doc because this is an overload that supports the implementation
   */
  public override getAllCookies(callback?: Callback<Cookie[]>): unknown {
    const promiseCallback = createPromiseCallback<Cookie[]>(callback);

    const cookies: Cookie[] = [];
    const { idx } = this;

    const domains = Object.keys(idx);
    for (const domain of domains) {
      const domainEntry = idx[domain] ?? {};
      const paths = Object.keys(domainEntry);
      for (const path of paths) {
        const pathEntry = domainEntry[path] ?? {};
        const keys = Object.keys(pathEntry);
        for (const key of keys) {
          const keyEntry = pathEntry[key] as Cookie | null;
          if (keyEntry) {
            cookies.push(keyEntry);
          }
        }
      }
    }

    // Sort by creationIndex so deserializing retains the creation order.
    // When implementing your own store, this SHOULD retain the order too
    cookies.sort((a, b) => {
      return (a.creationIndex || 0) - (b.creationIndex || 0);
    });

    return promiseCallback.resolve(cookies);
  }

  private _loadFromFile(): void {
    let data: string | null = null;
    let dataJson: Record<string, Record<string, Record<string, unknown>>> | null = null;

    if (existsSync(this.filePath)) {
      data = readFileSync(this.filePath, 'utf8');
    }

    if (data) {
      try {
        dataJson = JSON.parse(data);
      } catch (error) {
        throw new AggregateError(
          [error],
          `Could not parse cookie file ${this.filePath}. Please ensure it is not corrupted.`,
        );
      }
    }

    for (const domainName in dataJson) {
      for (const pathName in dataJson[domainName]) {
        for (const cookieName in dataJson[domainName][pathName]) {
          dataJson[domainName][pathName][cookieName] = Cookie.fromJSON(
            JSON.stringify(dataJson[domainName][pathName][cookieName]),
          );
        }
      }
    }

    this.idx = dataJson ?? Object.create(null);
  }

  private _saveToFile(): void {
    writeFileSync(this.filePath, JSON.stringify(this.idx));
  }

  public $inspect(): string {
    return `{ idx: ${inspect(this.idx, false, 2)} }`;
  }
}
