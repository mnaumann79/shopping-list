export async function toast(message: string) {
  void (await import("sonner")).toast(message)
}

export async function toastError(message: string) {
  void (await import("sonner")).toast.error(message)
}

export async function toastSuccess(message: string) {
  void (await import("sonner")).toast.success(message)
}
