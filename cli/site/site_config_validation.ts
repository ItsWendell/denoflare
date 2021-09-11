import { checkObject } from '../../common/check.ts';
import { SiteConfig, SiteMetadata } from './site_config.ts';

// deno-lint-ignore no-explicit-any
export function checkSiteConfig(config: any): SiteConfig {
    checkObject('config', config);

    const { organization, organizationSuffix, organizationSvg, organizationUrl, product, productRepo, productSvg, contentRepo, themeColor, themeColorDark, siteMetadata } = config;
    if (organization !== undefined) checkNotBlankString('organization', organization);
    if (organizationSuffix !== undefined) checkNotBlankString('organizationSuffix', organizationSuffix);
    if (organizationSvg !== undefined) checkNotBlankString('organizationSvg', organizationSvg);
    if (organizationUrl !== undefined) checkNotBlankString('organizationUrl', organizationUrl);
    checkNotBlankString('product', product);
    checkRepo('productRepo', productRepo);
    if (productSvg !== undefined) checkNotBlankString('productSvg', productSvg);
    checkRepo('contentRepo', contentRepo);
    checkThemeColor('themeColor', themeColor);
    checkThemeColor('themeColorDark', themeColorDark);
    if (themeColorDark && !themeColor) throw new Error(`themeColor required when themeColorDark defined`);
    checkSiteMetadata(siteMetadata);
    return { organization, organizationSuffix, organizationSvg, organizationUrl, product, productRepo, productSvg, contentRepo, themeColor, themeColorDark, siteMetadata };
}

//

// deno-lint-ignore no-explicit-any
function checkNotBlankString(name: string, value: any): value is string {
    if (typeof value !== 'string' || value === '') throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkSiteMetadata(siteMetadata: any): SiteMetadata {
    const { title, description, twitterUsername, image, origin } = siteMetadata;
    checkNotBlankString('title', title);
    checkNotBlankString('description', description);
    checkTwitterUsername('twitterUsername', twitterUsername);
    if (image !== undefined) checkNotBlankString('image', image);
    checkOrigin('origin', origin);
    return { title, description, twitterUsername, image, origin };
}

// deno-lint-ignore no-explicit-any
function checkThemeColor(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^#[a-fA-F0-9]{6}$/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkRepo(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^[\w]+\/[\w]+$/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkTwitterUsername(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || !/^@\w+/.test(value)) throw new Error(`Bad ${name}: ${value}`);
    return true;
}

// deno-lint-ignore no-explicit-any
function checkOrigin(name: string, value: any): value is string | undefined {
    if (value === undefined) return true;
    if (typeof value !== 'string' || new URL(value).toString() !== new URL(value).origin + '/') throw new Error(`Bad ${name}: ${value}`);
    return true;
}