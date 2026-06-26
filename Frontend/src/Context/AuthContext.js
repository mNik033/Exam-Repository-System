import React from "react"
const AuthContext = React.createContext({
  isLoggedIn: false,
  userId: null,
  token: null,
  name: null,
  email: null,
  credit: null,
  refCode: null,
  login: () => { },
  logout: () => { },
  updateCredit: () => { },
});


export default AuthContext;
