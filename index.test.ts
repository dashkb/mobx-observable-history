import "jest"
import { comparer, isObservable, reaction, toJS } from "mobx"
import { createBrowserHistory, createPath, History, Location } from "history";
import { createObservableHistory, IObservableHistory } from "./index";

let history: History;
let navigation: IObservableHistory;
let lastLocation: Location

beforeEach(() => {
  history = createBrowserHistory()
  navigation = createObservableHistory(history)
  navigation.listen(location => lastLocation = location)
  jest.spyOn(navigation, "goBack").mockImplementation(makeAsync(history.goBack)) // wait for "popstate" event
  jest.spyOn(navigation, "goForward").mockImplementation(makeAsync(history.goForward))
})

describe("observable-history", () => {
  test("extends history via prototype chain", () => {
    expect(Object.getPrototypeOf(navigation)).toBe(history);
  })
})

describe("history.action", () => {
  test("is observable getter", async () => {
    history.push(getRandomLocation());
    expect(navigation.action).toBe("PUSH");

    await navigation.goBack();
    expect(navigation.action).toBe("POP");

    await navigation.goForward();
    expect(navigation.action).toBe("POP");

    history.replace(getRandomLocation());
    expect(navigation.action).toBe("REPLACE");
  })
})

describe("history.location", () => {
  test("is observable", () => {
    expect(isObservable(navigation.location)).toBeTruthy();
  })

  test("allows partial updates of location object", async () => {
    let length = navigation.length
    let location1 = getRandomLocation()
    let location2 = getRandomLocation()

    history.push(location1) // 1
    expect(navigation.location).toMatchObject(location1)

    navigation.location.pathname = location2.pathname; // 2
    expect(lastLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname
    });

    navigation.location.search = location2.search; // 3
    expect(lastLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname,
      search: location2.search
    });

    navigation.location.hash = location2.hash; // 4
    expect(lastLocation).toMatchObject(location2);
    expect(navigation.length).toEqual(length + 4)
  })

  test("partial update with same history.location doesn't trigger reaction", () => {
    let reactionTimes = 0;
    let newLocation = getRandomLocation();
    reaction(() => createPath(navigation.location), () => reactionTimes++)

    navigation.location = newLocation as Location;
    navigation.location.pathname = newLocation.pathname
    navigation.location.search = newLocation.search
    navigation.location.hash = newLocation.hash
    navigation.push({ ...newLocation })
    expect(reactionTimes).toBe(1);
  })

  test("updating history.location.search skips `?` when empty", () => {
    navigation.replace("/?")
    expect(lastLocation.search).toBe("")
    navigation.location.search = "?"
    expect(lastLocation.search).toBe("")
    navigation.location.search = "test"
    expect(lastLocation.search).toBe("?test")
  })

  test("updating history.location.hash skips `#` when empty", () => {
    navigation.replace("/#")
    expect(lastLocation.hash).toBe("")
    navigation.location.hash = "#"
    expect(lastLocation.hash).toBe("")
    navigation.location.hash = "test"
    expect(lastLocation.hash).toBe("#test")
  })
})

describe("history.searchParams is reactive", () => {
  test("is instanceof URLSearchParams", function () {
    let location = getRandomLocation();
    let initParams = new URLSearchParams(location.search);
    history.replace(location);
    expect(navigation.searchParams).toBeInstanceOf(URLSearchParams);
    expect(navigation.searchParams.toString()).toEqual(initParams.toString());
  })

  test("sync with location.search", () => {
    history.replace(getRandomLocation())
    let search = `?` + navigation.searchParams.toString()
    expect(lastLocation.search).toBe(search)
    expect(navigation.location.search).toBe(search)
    expect(history.location.search).toBe(search)
  })

  test("updating via setter", () => {
    history.replace("/")
    let location = getRandomLocation();
    navigation.searchParams = location.search as any
    expect(lastLocation.search).toBe(location.search)
    expect(navigation.location.search).toBe(location.search)
  })

  test("partial params updates via object-api", () => {
    history.replace("/");

    let xAllValues: any[][] = []
    let yValues: any[] = []
    let locationSearchHistory: string[] = [];
    let searchParamsHistory: string[] = [];

    history.listen(location => {
      locationSearchHistory.push(location.search.replace("?", ""))
    })
    reaction(() => navigation.searchParams, params => {
      let queryParams = Array.from(params).map(pair => pair.join("=")).join("&")
      searchParamsHistory.push(queryParams)
    })
    reaction(() => navigation.searchParams.get("y"), y => yValues.push(y))
    reaction(() => navigation.searchParams.getAll("x"), allX => xAllValues.push(allX), {
      equals: comparer.shallow // avoid updates on every search-params change
    })

    navigation.push("?x=1")
    navigation.location.search = "x=1" // 1
    navigation.searchParams.append("x", "1") // 2
    navigation.searchParams.append("x", "2") // 3
    navigation.searchParams.set("x", "3") // 4
    navigation.searchParams.delete("x") // 5
    navigation.searchParams.delete("x")
    navigation.searchParams.append("y", "2") // 1
    navigation.searchParams.set("a", "1")
    navigation.searchParams.sort()
    navigation.searchParams.delete("y") // 2
    navigation.location.search = "?z=";

    expect(locationSearchHistory).toEqual(searchParamsHistory)
    expect(xAllValues.length).toBe(5)
    expect(yValues).toEqual(["2", null])
  })
})

describe("history.searchParams.getAsArray(param: string, splitter?: string | RegExp)", () => {
  test("parse values as array for searchParams.get(param)", () => {
    history.replace("/")
    let xValues = [1, 2].map(String)
    let yValues = [1, 2, 3].map(String)
    navigation.searchParams.set("x", xValues.join())
    navigation.searchParams.set("y", yValues.join("-"))
    expect(navigation.searchParams.getAsArray("x")).toEqual(xValues)
    expect(navigation.searchParams.getAsArray("y", /-/)).toEqual(yValues)
    expect(navigation.searchParams.getAsArray("z")).toEqual([])
  })
})

describe("history.searchParams.copyWith(newParams?: object, options?)", () => {
  test("creates a copy with new params", () => {
    let location = getRandomLocation();
    location.search = location.search.replace("?", "")
    navigation.replace(location);
    let copy = navigation.searchParams.copyWith({ x: 1 })
    expect(copy.toString()).toBe(location.search + '&x=1')
    expect(navigation.searchParams.toString()).toBe(location.search)
  })

  test("customize copy with second argument `options`", () => {
    let location = getRandomLocation();
    navigation.replace(location);
    let values = [1, 2, 3].map(String)
    let copy1 = navigation.searchParams.copyWith({ x: values }, { joinArrays: false })
    let copy2 = navigation.searchParams.copyWith({ x: values }, { joinArraysWith: "-" })
    let copy3 = navigation.searchParams.copyWith({ x: [], y: null }, { skipEmptyValues: false })
    expect(copy1.getAll("x")).toEqual(values)
    expect(copy2.getAsArray("x", "-")).toEqual(values)
    expect(copy3.toString()).toEqual(location.search.replace("?", "") + "&x=&y=")
  })
})

describe("history.searchParams.merge(newParams: object, options?)", () => {
  test('works as copyWith() but modifies current params', () => {
    let initParams = new URLSearchParams({ x: "1", y: Math.random().toString() })
    let values = [1, 2, 3].map(String)
    history.replace(`?` + initParams)
    navigation.searchParams.merge({ x: values }, { joinArraysWith: "-" })
    initParams.delete("x")
    initParams.set("x", values.join("-"))
    expect(navigation.searchParams.toString()).toBe(String(initParams));
  })
})

describe("history.searchParams.toString({withPrefix?, encoder?})", () => {
  test('allows to customize output with prefix `?`', () => {
    let location = getRandomLocation();
    history.replace(location)
    expect(navigation.searchParams.toString()).toBe(location.search.replace("?", ""));
    expect(navigation.searchParams.toString({ withPrefix: true })).toBe(location.search);
  })
  test("by default uses encodeURI(str) param encoder", () => {
    history.replace("/")
    navigation.searchParams.set("x", "/test")
    expect(navigation.searchParams.toString()).toBe('x=/test')
    expect(navigation.searchParams.toString({ encoder: encodeURIComponent })).toBe('x=%2Ftest')
  })
})

describe("history.merge(location, replace = false)", () => {
  test("partially updates location like direct access to history.location", () => {
    let location1 = getRandomLocation()
    let location2 = getRandomLocation()
    history.replace(location1)

    navigation.merge(location2.pathname);
    expect(lastLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname
    })

    navigation.merge({ search: location2.search });
    expect(lastLocation).toMatchObject({
      ...location1,
      pathname: location2.pathname,
      search: location2.search,
    })

    navigation.merge(location2);
    expect(lastLocation).toMatchObject(location2)
  })

  test("allows to history.replace with second argument replace=true", () => {
    let length = history.length
    navigation.merge(getRandomLocation()) // 1
    navigation.merge(getRandomLocation()) // 2
    navigation.merge("/test?x=1", true) // replace=true
    expect(history.length).toBe(length + 2)
  })
})

describe("destroy()", () => {
  test("stops all reactive observations and remove searchParams", () => {
    let counter = 0
    let onUpdate = () => counter++
    let reactions = [
      reaction(() => navigation.action, onUpdate),
      reaction(() => toJS(navigation.location), onUpdate),
      reaction(() => [...navigation.searchParams], onUpdate),
      navigation.listen(onUpdate),
    ]
    navigation.push(getRandomLocation());
    expect(counter).toBe(reactions.length);

    navigation.destroy();
    navigation.push(getRandomLocation());
    expect(isObservable(navigation.location)).toBeFalsy();
    expect(counter).toBe(reactions.length + 1);
    expect(navigation.location).toBe(history.location)
    expect(navigation.searchParams).toBeUndefined()
  })
})

function makeAsync(callback: Function, timeoutMs = 25) {
  return async () => {
    callback();
    await new Promise(resolve => setTimeout(resolve, timeoutMs));
  }
}

function generateId() {
  return Math.random().toString(16).substr(2);
}

function getRandomLocation() {
  return {
    pathname: `/test-${generateId()}`,
    search: `?test=${generateId()}`,
    hash: `#test-${generateId()}`,
  }
}
