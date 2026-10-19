import { FirebaseError } from 'firebase/app';

export function errorMessage(err: unknown): string {
  if (err instanceof FirebaseError) {
    switch (err.code) {
      case 'auth/invalid-credential':
      case 'auth/wrong-password':
      case 'auth/user-not-found':
        return 'Email or password is incorrect.';
      case 'auth/email-already-in-use':
        return 'An account already exists with this email.';
      case 'auth/weak-password':
        return 'Please choose a stronger password (at least 6 characters).';
      case 'auth/popup-closed-by-user':
        return 'Sign-in was cancelled.';
      case 'permission-denied':
        return 'You don’t have permission to do that.';
      case 'unavailable':
        return 'You appear to be offline. Please try again.';
      case 'resource-exhausted':
        return 'The free daily quota has been reached. Please try again tomorrow.';
      default:
        return err.message.replace(/^Firebase:\s*/, '').replace(/\s*\(.*\)\.?$/, '') || 'Something went wrong.';
    }
  }
  if (err instanceof Error) return err.message;
  return 'Something went wrong.';
}
