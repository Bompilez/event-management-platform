// firebase.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.5/firebase-app.js";
import {
  getAuth,
  signInAnonymously,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/10.12.5/firebase-auth.js";

export const firebaseConfig = {
  apiKey: "AIzaSyDReWIXMoVcqa_OzebE8ORFSqpjpQ1UkGU",
  authDomain: "campusksu-event-applikasjon.firebaseapp.com",
  projectId: "campusksu-event-applikasjon",
  storageBucket: "campusksu-event-applikasjon.firebasestorage.app",
  messagingSenderId: "1004637296766",
  appId: "1:1004637296766:web:0050d9a94a5966ddb9a02f"
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Promise som resolves når vi har uid
export const getAnonUid = () =>
  new Promise((resolve, reject) => {
    onAuthStateChanged(auth, (user) => {
      if (user) return resolve(user.uid);

      signInAnonymously(auth)
        .then((cred) => resolve(cred.user.uid))
        .catch(reject);
    });
  });
