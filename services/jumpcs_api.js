// ================= JUMP CS API =================

const Core = require("../core");

const API_URL =
  "https://api.shonenjumpplus.com/api/v1/graphql";

const CACHE_BEARER = "jumpcs_bearer";
const CACHE_DEVICE = "jumpcs_device_id";

const CLIENT_NAME =
  "com.access-company.ios.sh-jumpplus-apollo-ios";

const CLIENT_VERSION = "4.0.36+1";

const USER_AGENT =
  "ShonenJumpPlus-iOS/4.0.36 " +
  "(iPhone; CPU iPhone OS 26_5 like Mac OS X)";

function log(message, type) {
  Core.addLog("[JumpCS API] " + message, type || "info");
}

function safeJSON(value) {
  try {
    return JSON.stringify(value, null, 2);
  } catch (_) {
    //
    return String(value);
  }
}

function getStatusCode(res) {
  return res && res.response
    ? Number(res.response.statusCode || 0)
    : 0;
}

function getConfig() {
  const bearer = String(
    $cache.get(CACHE_BEARER) || ""
  ).trim();

  const deviceId = String(
    $cache.get(CACHE_DEVICE) || ""
  ).trim();

  if (!bearer) throw new Error("JUMPCS_NO_BEARER");
  if (!deviceId) throw new Error("JUMPCS_NO_DEVICE_ID");

  return { bearer, deviceId };
}

function saveBearer(token) {
  const value = String(token || "").trim();

  if (!value) {
    throw new Error("JUMPCS_EMPTY_BEARER");
  }

  $cache.set(CACHE_BEARER, value);
}

function makeHeaders(
  bearer,
  deviceId,
  operationName,
  operationType
) {
  return {
    Authorization: "Bearer " + bearer,
    "X-Giga-Platform": "App iOS",
    "X-GIGA-DEVICE-ID": deviceId,
    Accept:
      "multipart/mixed;deferSpec=20220824," +
      "application/graphql-response+json," +
      "application/json",
    "Accept-Language": "ja",
    "Content-Type": "application/json",
    "apollographql-client-version": CLIENT_VERSION,
    "apollographql-client-name": CLIENT_NAME,
    "X-APOLLO-OPERATION-TYPE":
      operationType || "mutation",
    "X-APOLLO-OPERATION-NAME": operationName,
    "User-Agent": USER_AGENT
  };
}

function extractData(res, operationName) {
  const status = getStatusCode(res);
  const body = res ? res.data : null;

  if (status !== 200) {
    throw new Error(
      operationName +
      "_HTTP_" +
      status +
      "_" +
      safeJSON(body)
    );
  }

  if (
    body &&
    Array.isArray(body.errors) &&
    body.errors.length
  ) {
    throw new Error(
      operationName +
      "_GRAPHQL_" +
      safeJSON(body.errors)
    );
  }

  if (!body || !body.data) {
    throw new Error(
      operationName +
      "_NO_DATA_" +
      safeJSON(body)
    );
  }

  return body.data;
}

async function request({
  bearer,
  deviceId,
  operationName,
  query,
  variables,
  operationType
}) {
  const body = {
    operationName,
    query,
    extensions: {
      clientLibrary: {
        name: "apollo-ios",
        version: "1.24.0"
      }
    }
  };

  if (variables !== undefined) {
    body.variables = variables;
  }

  const res = await $http.post({
    url:
      API_URL +
      "?opname=" +
      encodeURIComponent(operationName),
    timeout: 20,
    header: makeHeaders(
      bearer,
      deviceId,
      operationName,
      operationType
    ),
    body
  });

  return extractData(res, operationName);
}

async function login(
  bearer,
  deviceId,
  email,
  password
) {
  const query =
    "mutation Login($input: LoginInput!){" +
    "login(input:$input){" +
    "__typename userAccount{" +
    "__typename databaseId externalId emailAddress" +
    "}}}";

  const data = await request({
    bearer,
    deviceId,
    operationName: "Login",
    query,
    variables: {
      input: {
        emailAddress: email,
        password
      }
    }
  });

  const account =
    data &&
    data.login &&
    data.login.userAccount;

  if (!account) {
    throw new Error(
      "JUMPCS_LOGIN_NO_ACCOUNT_" +
      safeJSON(data)
    );
  }

  log("Login API thành công: " + email, "success");

  return account;
}

async function createStoreUrl(
  bearer,
  deviceId
) {
  const query =
    "mutation CreateCharacterStoreUrl{" +
    "createJumpCharactersStoreUrl{" +
    "__typename url" +
    "}}";

  const data = await request({
    bearer,
    deviceId,
    operationName: "CreateCharacterStoreUrl",
    query
  });

  const result =
    data &&
    data.createJumpCharactersStoreUrl;

  const url = String(
    result && result.url
      ? result.url
      : ""
  ).trim();

  if (!url) {
    throw new Error(
      "JUMPCS_STORE_URL_NOT_FOUND_" +
      safeJSON(data)
    );
  }

  const match = url.match(
    /[?&]subscr_token=([^&#]+)/
  );

  if (!match) {
    throw new Error(
      "JUMPCS_SUBSCR_TOKEN_NOT_FOUND"
    );
  }

  const token = decodeURIComponent(match[1]);

  log("Đã lấy Store URL", "success");

  return { url, token };
}

async function logout(
  bearer,
  deviceId
) {
  const query =
    "mutation Logout{" +
    "logout{" +
    "__typename sessionToken " +
    "userAccount{" +
    "__typename databaseId externalId" +
    "}}}";

  const data = await request({
    bearer,
    deviceId,
    operationName: "Logout",
    query
  });

  const result = data && data.logout;

  const nextBearer = String(
    result && result.sessionToken
      ? result.sessionToken
      : ""
  ).trim();

  if (!nextBearer) {
    throw new Error(
      "JUMPCS_LOGOUT_NO_NEW_BEARER_" +
      safeJSON(data)
    );
  }

  saveBearer(nextBearer);
  log("Đã logout và lưu Bearer mới", "success");

  return nextBearer;
}

async function loginAndGetStoreUrl({
  email,
  password
}) {
  let { bearer, deviceId } =
    getConfig();

  let account = null;

  log("Đang login Jump+ API", "info");

  try {
    account = await login(
      bearer,
      deviceId,
      email,
      password
    );
  } catch (e) {
    const reason =
      String(e && e.message
        ? e.message
        : e);

    if (
      !reason.includes(
        "USER_IS_ALREADY_LOGGED_IN"
      )
    ) {
      throw e;
    }

    log(
      "Bearer đang login, logout để tạo guest Bearer",
      "warn"
    );

    bearer = await logout(
      bearer,
      deviceId
    );

    account = await login(
      bearer,
      deviceId,
      email,
      password
    );
  }

  log("Đang lấy Store URL", "info");

  const store = await createStoreUrl(
    bearer,
    deviceId
  );

  log("Đang logout Jump+ API", "info");

  const nextBearer = await logout(
    bearer,
    deviceId
  );

  return {
    url: store.url,
    token: store.token,
    account,
    nextBearer
  };
}

module.exports = {
  loginAndGetStoreUrl
};