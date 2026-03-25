export interface Item {
  id: string
  title: string
  description: string
  rating: number
  categoryId: string
  createdAt: number
}

export interface Category {
  id: string
  name: string
  icon: string
}

export interface AppData {
  items: Item[]
  categories: Category[]
}
