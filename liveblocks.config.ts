// Define Liveblocks types for your application
// https://liveblocks.io/docs/api-reference/liveblocks-react#Typing-your-data
declare global {
  interface Liveblocks {
    // Custom user info set when authenticating with a secret key
    UserMeta: {
      id: string
      info: {
        name: string
        avatar?: string
      }
    }
  }
}

export {}
