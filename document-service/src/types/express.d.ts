declare global {
  namespace Express {
    interface Locals {
      ownerId: string
      collectionId: string
    }
  }
}

export {}