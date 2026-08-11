const GRAPHQL_URL =
  (import.meta.env && import.meta.env["VITE_GRAPHQL_URL"]) || "http://localhost:4000/graphql";

export interface GraphQLError {
  message: string;
  locations?: { line: number; column: number }[];
  path?: (string | number)[];
  extensions?: {
    code?: string;
    status?: number;
    [key: string]: any;
  };
}

export interface GraphQLResponse<T> {
  data?: T;
  errors?: GraphQLError[];
}

interface QueueItem {
  resolve: (newAccessToken: string) => void;
  reject: (reason?: any) => void;
}

let isRefreshing = false;
let failedQueue: QueueItem[] = [];

const processQueue = (error: any, token: string | null = null) => {
  failedQueue.forEach((item) => {
    if (error) {
      item.reject(error);
    } else if (token) {
      item.resolve(token);
    }
  });
  failedQueue = [];
};

const REFRESH_TOKEN_MUTATION = `
  mutation RefreshToken($refreshToken: String!) {
    refreshToken(refreshToken: $refreshToken) {
      accessToken
      refreshToken
    }
  }
`;

function isAuthError(responseStatus: number, errors?: GraphQLError[]): boolean {
  if (responseStatus === 401 || responseStatus === 403) return true;
  if (!errors || errors.length === 0) return false;
  return errors.some((err) => {
    const code = err.extensions?.["code"];
    const status = err.extensions?.["status"];
    const msg = (err.message || "").toLowerCase();
    return (
      code === "UNAUTHENTICATED" ||
      code === "FORBIDDEN" ||
      status === 401 ||
      status === 403 ||
      msg.includes("jwt failed") ||
      msg.includes("invalid token") ||
      msg.includes("token expired") ||
      msg.includes("unauthorized") ||
      msg.includes("forbidden") ||
      msg.includes("401") ||
      msg.includes("403")
    );
  });
}

function handleAuthFailure() {
  if (typeof window !== "undefined") {
    localStorage.removeItem("accessToken");
    localStorage.removeItem("refreshToken");
    localStorage.removeItem("authUser");
    window.dispatchEvent(new CustomEvent("auth:logout"));
  }
}

export async function graphqlRequest<T = any>(
  query: string,
  variables: Record<string, any> = {},
  overrideToken?: string
): Promise<T> {
  const token =
    overrideToken !== undefined
      ? overrideToken
      : typeof window !== "undefined"
      ? localStorage.getItem("accessToken")
      : null;

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;
  try {
    response = await fetch(GRAPHQL_URL, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables,
      }),
    });
  } catch (err) {
    throw err;
  }

  let result: GraphQLResponse<T> = {};
  let parseError = false;
  try {
    result = await response.json();
  } catch {
    parseError = true;
  }

  const isJwtError = isAuthError(response.status, result.errors);
  const isAuthMutation =
    query.includes("Login") ||
    query.includes("Register") ||
    query.includes("RefreshToken");

  // If JWT authorization failed (and this isn't login/register/refresh mutation itself)
  if (isJwtError && !isAuthMutation) {
    const storedRefreshToken =
      typeof window !== "undefined" ? localStorage.getItem("refreshToken") : null;

    if (!storedRefreshToken) {
      handleAuthFailure();
      const errorMsg = result.errors?.map((e) => e.message).join(", ") || "Unauthorized";
      throw new Error(errorMsg);
    }

    if (isRefreshing) {
      // Refresh already in progress -> queue this request until token is refreshed
      try {
        const newToken = await new Promise<string>((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        });
        return graphqlRequest<T>(query, variables, newToken);
      } catch (err) {
        throw err;
      }
    }

    isRefreshing = true;

    try {
      const refreshResult = await fetch(GRAPHQL_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: REFRESH_TOKEN_MUTATION,
          variables: { refreshToken: storedRefreshToken },
        }),
      });

      const refreshData: GraphQLResponse<{
        refreshToken: { accessToken: string; refreshToken: string };
      }> = await refreshResult.json();

      if (
        !refreshResult.ok ||
        refreshData.errors?.length ||
        !refreshData.data?.refreshToken
      ) {
        throw new Error("Refresh token invalid or expired");
      }

      const { accessToken: newAccessToken, refreshToken: newRefreshToken } =
        refreshData.data.refreshToken;

      if (typeof window !== "undefined") {
        localStorage.setItem("accessToken", newAccessToken);
        localStorage.setItem("refreshToken", newRefreshToken);
        window.dispatchEvent(
          new CustomEvent("auth:tokens_refreshed", {
            detail: { accessToken: newAccessToken, refreshToken: newRefreshToken },
          })
        );
      }

      processQueue(null, newAccessToken);
      isRefreshing = false;

      // Retry original request with newly acquired access token
      return graphqlRequest<T>(query, variables, newAccessToken);
    } catch (refreshErr) {
      processQueue(refreshErr, null);
      isRefreshing = false;
      handleAuthFailure();
      throw refreshErr;
    }
  }

  if (!response.ok && !isJwtError) {
    throw new Error(`HTTP error ${response.status}: ${response.statusText}`);
  }

  if (parseError) {
    throw new Error("Failed to parse response from GraphQL gateway");
  }

  if (result.errors && result.errors.length > 0) {
    const errorMsg = result.errors.map((e) => e.message).join(", ");
    throw new Error(errorMsg);
  }

  if (!result.data) {
    throw new Error("No data returned from GraphQL gateway");
  }

  return result.data;
}
