const firebaseConfig = {
    apiKey: "AIzaSyApPjrvUKCNuusAhTMkRpVHi4BaSLXHbRg",
    authDomain: "dukeforest-96e53.firebaseapp.com",
    projectId: "dukeforest-96e53",
    storageBucket: "dukeforest-96e53.firebasestorage.app",
    messagingSenderId: "807394176812",
    appId: "1:807394176812:web:e48233f5bc063433efc689",
    measurementId: "G-Q4V8NRCXBT"
  };
  
  // Initialize Firebase
  firebase.initializeApp(firebaseConfig);
  
  // Initialize Cloud Firestore.
  const db = firebase.firestore();
