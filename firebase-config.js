// firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";
import { getStorage } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js";

const firebaseConfig = {
  apiKey: "AIzaSyACNdGD22TJIYYJc8jA4GVx2p01xTvV2oI",
  authDomain: "bhoomishuraksh.firebaseapp.com",
  projectId: "bhoomishuraksh",
  storageBucket: "bhoomishuraksh.firebasestorage.app",
  messagingSenderId: "688972424564",
  appId: "1:688972424564:web:2201d8bb7141fb87563821"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);