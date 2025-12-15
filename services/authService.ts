import { User } from '../types';

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE';

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

let isInitialized = false;

export const initGoogleAuth = (callback: (user: User) => void) => {
    // Retry until google script is loaded
    const intervalId = setInterval(() => {
        // @ts-ignore
        if (typeof google !== 'undefined' && google.accounts) {
            clearInterval(intervalId);
            try {
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
                    },
                    auto_select: true // Attempt to auto-sign in
                });
                isInitialized = true;
                // console.log("GSI Initialized");
            } catch (error) {
                console.error("GSI Initialization Error", error);
            }
        }
    }, 100);
};

export const renderGoogleButton = (elementId: string) => {
     const intervalId = setInterval(() => {
         // @ts-ignore
         if (typeof google !== 'undefined' && isInitialized) {
             clearInterval(intervalId);
             const element = document.getElementById(elementId);
             if (element) {
                 try {
                     // @ts-ignore
                     google.accounts.id.renderButton(
                        element,
                        { theme: "outline", size: "large", type: "standard", text: "signin_with" } 
                     );
                 } catch (e) {
                     console.error("GSI Render Error", e);
                 }
             }
         }
     }, 100);
};

export const promptGoogleOneTap = () => {
    const intervalId = setInterval(() => {
        // @ts-ignore
        if (typeof google !== 'undefined' && isInitialized) {
            clearInterval(intervalId);
            try {
                // @ts-ignore
                google.accounts.id.prompt();
            } catch (e) {
                // console.warn("One Tap Prompt Error", e);
            }
        }
    }, 500);
}
