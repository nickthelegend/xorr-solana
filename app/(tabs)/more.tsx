/**
 * Compatibility route for the former grid tab.
 *
 * The approved shell has three actions — Home, Swap and Messages — so there is no fourth More
 * control to select. Leaving the old route blank nevertheless made existing deep links a dead
 * end. Explore is the maintained catalogue of the same wallet, activity, proof and settings
 * surfaces, so send callers there.
 */
import React from 'react';
import { Redirect } from 'expo-router';

export default function More() {
  return <Redirect href="/explore" />;
}
