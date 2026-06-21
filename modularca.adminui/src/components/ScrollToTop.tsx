import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

const ScrollToTop: React.FC = () => {
    const { pathname } = useLocation();
    useEffect(() => {
        const main = document.querySelector('main');
        if (main) main.scrollTop = 0;
        window.scrollTo(0, 0);
        // Reset tab order: blur whatever held focus on the previous page so the
        // next Tab keystroke starts from the first focusable element on the new route.
        (document.activeElement as HTMLElement | null)?.blur();
    }, [pathname]);
    return null;
};

export default ScrollToTop;
