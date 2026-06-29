import { useEffect } from 'react';
import { useLocation, matchPath } from 'react-router-dom';

/**
 * Sets the browser tab title per route. Mounted once inside the Router; on navigation it resolves the
 * current path to a friendly name and sets document.title to "<Page> · ModularCA". Ordered
 * most-specific → least-specific (first match wins); matchPath uses end:true so list routes don't
 * swallow deeper paths.
 */
const SUFFIX = 'ModularCA';

const ROUTE_TITLES: Array<[string, string]> = [
    ['/dashboard', 'Dashboard'],
    ['/request', 'Request Certificate'],
    ['/requests', 'My Requests'],
    ['/certificates', 'My Certificates'],
    ['/ssh', 'SSH Certificates'],
    ['/authorities', 'CA Information'],
    ['/account', 'My Account'],
    ['/security', 'Security'],

    // Auth (outside the main shell)
    ['/login', 'Sign In'],
    ['/mfa-setup', 'MFA Setup'],
    ['/mfa-verify', 'Verify MFA'],
    ['/mfa-callback', 'Signing In'],
    ['/banner', 'Login Banner'],

    ['/', 'Dashboard'],
];

function titleForPath(pathname: string): string | null {
    for (const [pattern, title] of ROUTE_TITLES) {
        if (matchPath(pattern, pathname)) return title;
    }
    return null;
}

const TitleManager: React.FC = () => {
    const { pathname } = useLocation();
    useEffect(() => {
        const t = titleForPath(pathname);
        document.title = t ? `${t} · ${SUFFIX}` : SUFFIX;
    }, [pathname]);
    return null;
};

export default TitleManager;
