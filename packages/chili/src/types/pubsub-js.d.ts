declare module "pubsub-js" {
    export function publish(topic: string, data?: any): boolean;
    export function subscribe(topic: string, callback: (msg: string, data: any) => void): string;
    export function unsubscribe(token: string): boolean;
    export function clearAllSubscriptions(): void;
}
