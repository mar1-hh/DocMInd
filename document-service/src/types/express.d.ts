declare global {
  namespace Express {
    interface Locals {
      ownerId: string
    }
  }
}

export {}