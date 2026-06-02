export const BRAND_ASSET_PATHS = {
  productionMacIconPng: "assets/prod/black-macos-1024.png",
  productionLinuxIconPng: "assets/prod/black-universal-1024.png",
  productionWindowsIconIco: "assets/prod/t3-black-windows.ico",
  productionWebFaviconIco: "assets/prod/t3-black-web-favicon.ico",
  productionWebFavicon16Png: "assets/prod/t3-black-web-favicon-16x16.png",
  productionWebFavicon32Png: "assets/prod/t3-black-web-favicon-32x32.png",
  productionWebInstallIconPng: "assets/prod/t3-black-web-install-1024.png",
  productionWebAppleTouchIconPng: "assets/prod/t3-black-web-apple-touch-180.png",
  productionWebMaskableIconSvg: "assets/prod/t3-black-web-maskable.svg",

  nightlyMacIconPng: "assets/nightly/blueprint-macos-1024.png",
  nightlyLinuxIconPng: "assets/nightly/blueprint-universal-1024.png",
  nightlyWindowsIconIco: "assets/nightly/blueprint-windows.ico",

  developmentDesktopIconPng: "assets/dev/blueprint-macos-1024.png",
  developmentWindowsIconIco: "assets/dev/blueprint-windows.ico",
  developmentWebFaviconIco: "assets/prod/t3-black-web-favicon.ico",
  developmentWebFavicon16Png: "assets/prod/t3-black-web-favicon-16x16.png",
  developmentWebFavicon32Png: "assets/prod/t3-black-web-favicon-32x32.png",
  developmentWebInstallIconPng: "assets/prod/t3-black-web-install-1024.png",
  developmentWebAppleTouchIconPng: "assets/prod/t3-black-web-apple-touch-180.png",
  developmentWebMaskableIconSvg: "assets/prod/t3-black-web-maskable.svg",
} as const;

export type WebAssetBrand = "development" | "production";

export interface IconOverride {
  readonly sourceRelativePath: string;
  readonly targetRelativePath: string;
}

const WEB_ICON_TARGET_FILENAMES = {
  faviconIco: "favicon.ico",
  favicon16Png: "favicon-16x16.png",
  favicon32Png: "favicon-32x32.png",
  installIconPng: "app-icon-install-1024.png",
  appleTouchIconPng: "apple-touch-icon.png",
  maskableIconSvg: "app-icon-maskable.svg",
} as const;

const WEB_ICON_SOURCE_PATHS_BY_BRAND = {
  development: {
    faviconIco: BRAND_ASSET_PATHS.developmentWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.developmentWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.developmentWebFavicon32Png,
    installIconPng: BRAND_ASSET_PATHS.developmentWebInstallIconPng,
    appleTouchIconPng: BRAND_ASSET_PATHS.developmentWebAppleTouchIconPng,
    maskableIconSvg: BRAND_ASSET_PATHS.developmentWebMaskableIconSvg,
  },
  production: {
    faviconIco: BRAND_ASSET_PATHS.productionWebFaviconIco,
    favicon16Png: BRAND_ASSET_PATHS.productionWebFavicon16Png,
    favicon32Png: BRAND_ASSET_PATHS.productionWebFavicon32Png,
    installIconPng: BRAND_ASSET_PATHS.productionWebInstallIconPng,
    appleTouchIconPng: BRAND_ASSET_PATHS.productionWebAppleTouchIconPng,
    maskableIconSvg: BRAND_ASSET_PATHS.productionWebMaskableIconSvg,
  },
} as const satisfies Record<WebAssetBrand, Record<keyof typeof WEB_ICON_TARGET_FILENAMES, string>>;

export function resolveWebIconOverrides(
  brand: WebAssetBrand,
  targetDirectory: string,
): ReadonlyArray<IconOverride> {
  const sourcePaths = WEB_ICON_SOURCE_PATHS_BY_BRAND[brand];
  return [
    {
      sourceRelativePath: sourcePaths.faviconIco,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.faviconIco}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon16Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon16Png}`,
    },
    {
      sourceRelativePath: sourcePaths.favicon32Png,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.favicon32Png}`,
    },
    {
      sourceRelativePath: sourcePaths.installIconPng,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.installIconPng}`,
    },
    {
      sourceRelativePath: sourcePaths.appleTouchIconPng,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.appleTouchIconPng}`,
    },
    {
      sourceRelativePath: sourcePaths.maskableIconSvg,
      targetRelativePath: `${targetDirectory}/${WEB_ICON_TARGET_FILENAMES.maskableIconSvg}`,
    },
  ];
}

export const DEVELOPMENT_ICON_OVERRIDES = resolveWebIconOverrides("development", "dist/client");

export const PUBLISH_ICON_OVERRIDES = resolveWebIconOverrides("production", "dist/client");
