export interface LavalinkNode {
    name: string;
    url: string;
    auth: string;
}

export interface Track {
    encoded: string;
    info: {
        identifier: string;
        isSeekable: boolean;
        author: string;
        length: number;
        isStream: boolean;
        position: number;
        title: string;
        uri: string;
        sourceName: string;
    };
}

export interface MusicQueueItem {
    id: string;
    position: number;
    track: Track;
    requestedBy: {
        id: string;
        username: string;
    };
    createdAt: Date;
}

export interface GameSessionState {
    players: Map<string, any>;
    phase: 'setup' | 'playing' | 'finished';
    // Add game-specific state properties
}

export interface DonationWebhookData {
    provider: 'stripe' | 'patreon' | 'kofi';
    amount: number;
    currency: string;
    userId: string;
    externalRef: string;
}
