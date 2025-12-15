import { User } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'; // Replace with actual Client ID or use Env

// Helper to decode JWT parts
const parseJwt = (token: string) => {
    try {
        const base64Url = token.split('.')[1];
        const base64 = base64Url.replace(/-/g, '+').replace(/_/g, '/');
        const jsonPayload = decodeURIComponent(window.atob(base64).split('').map(function(c) {
            return '%' + ('00' + c.charCodeAt(0).toString(16)).slice(-2);
        }).join(''));
        return JSON.parse(jsonPayload);
    } catch (e) {
        console.error("Failed to parse JWT", e);
        return null;
    }
};

export const initGoogleAuth = (callback: (user: User) => void) => {
    // @ts-ignore
    if (typeof google === 'undefined') {
        console.error("Google Identity Services script not loaded.");
        return;
    }

    // @ts-ignore
    google.accounts.id.initialize({
        client_id: CLIENT_ID,
        callback: (response: any) => {
            const payload = parseJwt(response.credential);
            if (payload) {
                const user: User = {
                    name: payload.name,
                    email: payload.email,
                    picture: payload.picture,
                };
                callback(user);
            }
        }
    });
};

export const renderGoogleButton = (elementId: string) => {
     // @ts-ignore
     if (typeof google === 'undefined') return;
     
     // @ts-ignore
     google.accounts.id.renderButton(
        document.getElementById(elementId),
        { theme: "outline", size: "large", type: "standard", text: "signin_with" } 
     );
};

export const promptGoogleOneTap = () => {
    // @ts-ignore
    if (typeof google !== 'undefined') {
        // @ts-ignore
        google.accounts.id.prompt();
    }
}