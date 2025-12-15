// Google Drive Service

const CLIENT_ID = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID_HERE'; // Replace with actual Client ID or use Env
const SCOPES = 'https://www.googleapis.com/auth/drive.file';

let tokenClient: any;
let accessToken: string | null = null;

export const initGoogleDrive = (callback: (token: string) => void) => {
    // @ts-ignore
    if (typeof google === 'undefined') return;

    // @ts-ignore
    tokenClient = google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (response: any) => {
            if (response.error !== undefined) {
                console.error("Auth Error", response);
                throw response;
            }
            accessToken = response.access_token;
            callback(response.access_token);
        },
    });
};

export const requestAccessToken = () => {
    if (tokenClient) {
        tokenClient.requestAccessToken();
    } else {
        console.error("Token Client not initialized");
    }
};

export const uploadFileToDrive = async (
    title: string, 
    content: string, 
    token: string
): Promise<any> => {
    const fileContent = new Blob([content], { type: 'text/markdown' });
    const metadata = {
        name: `${title}.md`,
        mimeType: 'text/markdown',
    };

    const form = new FormData();
    form.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    form.append('file', fileContent);

    const response = await fetch('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart', {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${token}`,
        },
        body: form,
    });

    if (!response.ok) {
        throw new Error(`Upload Failed: ${response.statusText}`);
    }

    return await response.json();
};