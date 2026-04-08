import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuth } from './context/AuthContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Budgets from './pages/Budgets';
import Invoices from './pages/Invoices';
import NFATracker from './pages/Nfatracker';
import POTracker from './pages/POTracker';
import Vendors from './pages/Vendors';
// Payments hidden from nav — route kept for deep links if needed

function PrivateRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  return user ? children : <Navigate to="/login" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/*"
        element={
          <PrivateRoute>
            <Layout>
              <Routes>
                <Route path="/"            element={<Dashboard />} />
                <Route path="/budgets"     element={<Budgets />} />
                <Route path="/nfa-tracker" element={<NFATracker />} />
                <Route path="/po"          element={<POTracker />} />
                <Route path="/invoices"    element={<Invoices />} />
                <Route path="/vendors"     element={<Vendors />} />
              </Routes>
            </Layout>
          </PrivateRoute>
        }
      />
    </Routes>
  );
}