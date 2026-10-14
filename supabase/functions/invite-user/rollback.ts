export type DeleteUser = (id: string) => Promise<{ error: { message: string } | null }>

export async function rollbackInvitedUser(deleteUser: DeleteUser, userId: string): Promise<boolean> {
  let message: string
  try {
    const { error } = await deleteUser(userId)
    if (!error) return true
    message = error.message
  } catch (err) {
    message = err instanceof Error ? err.message : String(err)
  }
  console.error('invite-user rollback failed', { userId, message })
  return false
}
