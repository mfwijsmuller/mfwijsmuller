import { type LoginError, LoginErrors } from "@shopify/shopify-app-remix/server";

export function loginErrorMessage(loginErrors: LoginError) {
  if (loginErrors?.shop === LoginErrors.MissingShop) {
    return { shop: "Please enter your shop domain to log in." };
  } else if (loginErrors?.shop === LoginErrors.InvalidShop) {
    return { shop: "Invalid shop domain. Please try again." };
  }
  return {};
}
