
import './App.css';

import React from 'react'
import SurveyComponent from './components/SurveyComponent.js';
import { Route, Routes } from 'react-router-dom';
import { Dashboard } from './pages/Dashboard.js';

export const App = () => {
  return (
    <>
      <Routes>
        <Route path='/survey' element={<SurveyComponent/>}/>
        <Route path='/dashboard' element={<Dashboard />}/>
      </Routes>
    </>
  )
}

export default App;