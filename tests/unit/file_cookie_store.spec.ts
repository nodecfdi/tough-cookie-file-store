import { writeFileSync } from 'node:fs';
import { Cookie, Store } from 'tough-cookie';
import { FileCookieStore } from '../../src/file_cookie_store.js';
import { filePath } from '../test_utils.js';

describe('file cookie store', () => {
  let cookieStore: FileCookieStore;
  const expiresDate = new Date('Fri Jan 01 2021 10:00:00 GMT');
  const creationDate = new Date('Wed, Jan 2020 10:00:00 GMT');
  const lastAccessedDate = creationDate;

  beforeEach(() => {
    cookieStore = new FileCookieStore(filePath('cookies.json'));
  });

  test('file cookie store should be instance of store class', () => {
    expect(cookieStore).toBeInstanceOf(Store);
  });

  test('throw an error when file can not be parsed', () => {
    expect(() => new FileCookieStore(filePath('cookies_parse_error.json'))).toThrowError(/Could not parse cookie/);
  });

  test('idx should contain object', () => {
    const idxInspect = cookieStore.$inspect();

    expect(idxInspect).includes('idx: {');
  });

  test('find a cookie with the given domain, path and key (example.com, /, foo)', async () => {
    const cookie = await cookieStore.findCookie('example.com', '/', 'foo');

    expect(cookie).toBeDefined();
    expect(cookie?.key).toBe('foo');
    expect(cookie?.value).toBe('foo');
    expect(cookie?.domain).toBe('example.com');
    expect(cookie?.path).toBe('/');
    expect(cookie?.hostOnly).toBeFalsy();
  });

  test.each([
    ['foo.com', '/', 'bar'],
    ['example.com', '/home', 'bar'],
    ['exmaple.com', '/', 'c'],
  ])(
    'not find a cookie with the given domain, path and key (%s, %s, %s)',
    async (domain: string, path: string, key: string) => {
      const cookie = await cookieStore.findCookie(domain, path, key);

      expect(cookie).toBeUndefined();
    },
  );

  test('find cookies matching the given domain and path (example.com, all paths)', async () => {
    const cookies = await cookieStore.findCookies('example.com', null);

    expect(cookies).toHaveLength(2);
    expect(cookies[0].key).toBe('foo');
    expect(cookies[0].value).toBe('foo');
    expect(cookies[0].domain).toBe('example.com');
    expect(cookies[0].path).toBe('/');
    expect(cookies[0].hostOnly).toBeFalsy();
  });

  test('find cookies matching the given domain and path (example.com, /login)', async () => {
    const cookies = await cookieStore.findCookies('example.com', '/login');

    expect(cookies).toHaveLength(2);
    expect(cookies[1].key).toBe('bar');
    expect(cookies[1].value).toBe('bar');
    expect(cookies[1].domain).toBe('example.com');
    expect(cookies[1].path).toBe('/login');
    expect(cookies[1].hostOnly).toBeFalsy();
  });

  test('not find cookies matching the given domain and path (foo.com, /)', async () => {
    const cookies = await cookieStore.findCookies('foo.com', '/');

    expect(cookies).toHaveLength(0);
  });

  test('not find cookies matching the given domain and path (no domain)', async () => {
    const cookies = await cookieStore.findCookies('', '/');

    expect(cookies).toHaveLength(0);
  });

  test('not find cookies matching the given domain and path (.local domain)', async () => {
    const cookies = await cookieStore.findCookies('.local', '/', true);

    expect(cookies).toHaveLength(0);
  });

  test('add a new "baz" cookie to the store', async () => {
    const cookieBaz = Cookie.parse('baz=baz; Domain=example.com; Path=/');
    await cookieStore.putCookie(cookieBaz!);
    const cookie = await cookieStore.findCookie('example.com', '/', 'baz');

    expect(cookie).toBeDefined();
    expect(cookie?.key).toBe('baz');
    expect(cookie?.value).toBe('baz');
    expect(cookie?.domain).toBe('example.com');
    expect(cookie?.path).toBe('/');

    await cookieStore.removeCookie('example.com', '/', 'baz');
  });

  test('add a new "baz" cookie to the store empty', async () => {
    const cookieFileEmptyPath = filePath('cookies_empty.json');
    const cookieBaz = Cookie.parse('baz=baz; Domain=example.com; Path=/');
    const cookieStoreEmpty = new FileCookieStore(cookieFileEmptyPath);
    await cookieStoreEmpty.putCookie(cookieBaz!);
    const cookie = await cookieStoreEmpty.findCookie('example.com', '/', 'baz');

    expect(cookie).toBeDefined();
    expect(cookie?.key).toBe('baz');
    expect(cookie?.value).toBe('baz');
    expect(cookie?.domain).toBe('example.com');
    expect(cookie?.path).toBe('/');

    writeFileSync(cookieFileEmptyPath, '{}', { encoding: 'utf8', flag: 'w' });
  });

  test('update the value of an existing "foo" cookie', async () => {
    const oldCookie = Cookie.parse('foo=bar; Domain=example.com; Path=/');
    oldCookie!.expires = expiresDate;
    oldCookie!.creation = creationDate;
    oldCookie!.hostOnly = false;
    oldCookie!.lastAccessed = lastAccessedDate;
    const newCookie = oldCookie!;
    newCookie.value = 'bar';
    await cookieStore.updateCookie(oldCookie!, newCookie);
    const cookie = await cookieStore.findCookie('example.com', '/', 'foo');

    expect(cookie).toBeDefined();
    expect(cookie?.key).toBe('foo');
    expect(cookie?.value).toBe('bar');
    expect(cookie?.domain).toBe('example.com');
    expect(cookie?.path).toBe('/');
    expect(cookie?.hostOnly).toBeFalsy();

    const restoreCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    restoreCookie!.expires = expiresDate;
    restoreCookie!.creation = creationDate;
    restoreCookie!.hostOnly = false;
    restoreCookie!.lastAccessed = lastAccessedDate;
    await cookieStore.putCookie(restoreCookie!);
  });

  test('remove a cookie from the store', async () => {
    const cookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    const cookieStoreEmpty = new FileCookieStore(filePath('cookies_empty.json'));
    await cookieStoreEmpty.putCookie(cookie!);
    await cookieStoreEmpty.removeCookie('example.com', '/', 'foo');
    const cookieRemoved = await cookieStoreEmpty.findCookies('example.com', '/');

    expect(cookieRemoved).toHaveLength(0);
  });

  test('remove matching cookies from the store (domain + path)', async () => {
    const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar');
    const cookieStoreEmpty = new FileCookieStore(filePath('cookies_empty.json'));
    await cookieStoreEmpty.putCookie(fooCookie!);
    await cookieStoreEmpty.putCookie(barCookie!);
    await cookieStoreEmpty.removeCookies('example.com', '/');
    const cookies = await cookieStoreEmpty.findCookies('example.com', '/');

    expect(cookies).toHaveLength(0);
  });

  test('remove matching cookies from the store (domain)', async () => {
    const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar');
    const cookieStoreEmpty = new FileCookieStore(filePath('cookies_empty.json'));
    await cookieStoreEmpty.putCookie(fooCookie!);
    await cookieStoreEmpty.putCookie(barCookie!);
    await cookieStoreEmpty.removeCookies('example.com', null);
    const cookies = await cookieStoreEmpty.findCookies('example.com', null);

    expect(cookies).toHaveLength(0);
  });

  test('remove all cookies from the store', async () => {
    const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar');
    const cookieStoreEmpty = new FileCookieStore(filePath('cookies_empty.json'));
    await cookieStoreEmpty.putCookie(fooCookie!);
    await cookieStoreEmpty.putCookie(barCookie!);
    await cookieStoreEmpty.removeAllCookies();
    const cookies = await cookieStoreEmpty.findCookies('example.com', '/');

    expect(cookies).toHaveLength(0);
  });

  test('return an "array" of cookies', async () => {
    const cookies = await cookieStore.getAllCookies();

    expect(cookies).toHaveLength(2);
  });

  test('return an "array" of cookies on empty store', async () => {
    const fooCookie = Cookie.parse('foo=foo; Domain=example.com; Path=/');
    const barCookie = Cookie.parse('bar=bar; Domain=example.com; Path=/bar');
    const cookieFileEmptyPath = filePath('cookies_empty.json');
    const cookieStoreEmpty = new FileCookieStore(cookieFileEmptyPath);
    await cookieStoreEmpty.putCookie(fooCookie!);
    await cookieStoreEmpty.putCookie(barCookie!);
    const cookies = await cookieStoreEmpty.getAllCookies();

    expect(cookies).toHaveLength(2);

    writeFileSync(cookieFileEmptyPath, '{}', { encoding: 'utf8', flag: 'w' });
  });
});
