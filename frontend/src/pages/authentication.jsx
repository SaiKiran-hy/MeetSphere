import * as React from 'react';
import {
    Avatar,
    Button,
    CssBaseline,
    TextField,
    Box,
    Typography,
    InputAdornment,
    IconButton,
    Tabs,
    Tab,
    Alert,
    Snackbar,
    CircularProgress,
    Stack
} from '@mui/material';
import VideocamRoundedIcon from '@mui/icons-material/VideocamRounded';
import Visibility from '@mui/icons-material/Visibility';
import VisibilityOff from '@mui/icons-material/VisibilityOff';
import GroupsRoundedIcon from '@mui/icons-material/GroupsRounded';
import ScreenShareRoundedIcon from '@mui/icons-material/ScreenShareRounded';
import LockRoundedIcon from '@mui/icons-material/LockRounded';
import { useContext, useState } from 'react';
import { AuthContext } from '../contexts/AuthContext';

export default function Authentication() {
    const [tab, setTab] = useState(0); // 0 = Sign In, 1 = Sign Up

    const [name, setName] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [showPassword, setShowPassword] = useState(false);

    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);

    const [snackbar, setSnackbar] = useState({ open: false, message: '' });

    const { handleRegister, handleLogin } = useContext(AuthContext);

    const resetForm = () => {
        setName('');
        setUsername('');
        setPassword('');
        setError('');
    };

    const handleTabChange = (_event, newValue) => {
        setTab(newValue);
        resetForm();
    };

    const handleAuth = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);

        try {
            if (tab === 0) {
                await handleLogin(username, password);
            } else {
                const message = await handleRegister(name, username, password);
                setSnackbar({ open: true, message: message || 'Registered successfully' });
                resetForm();
                setTab(0);
            }
        } catch (err) {
            const message =
                err?.response?.data?.message || err?.message || 'Something went wrong. Please try again.';
            setError(message);
        } finally {
            setLoading(false);
        }
    };

    return (
        <Box
            sx={{
                height: '100vh',
                width: '100vw',
                display: 'flex',
                overflow: 'hidden',
                bgcolor: '#0b1f33'
            }}
        >
            <CssBaseline />

            {/* LEFT — brand / feature panel */}
            <Box
                sx={{
                    display: { xs: 'none', md: 'flex' },
                    flex: '0 0 55%',
                    position: 'relative',
                    flexDirection: 'column',
                    justifyContent: 'space-between',
                    p: 7,
                    color: '#fff',
                    background:
                        'radial-gradient(circle at 20% 20%, #1f6feb 0%, transparent 45%), radial-gradient(circle at 80% 0%, #7c3aed 0%, transparent 40%), linear-gradient(160deg, #0b1f33 0%, #102a43 60%, #0b1f33 100%)'
                }}
            >
                <Stack direction="row" alignItems="center" spacing={1.5}>
                    <Box
                        sx={{
                            width: 44,
                            height: 44,
                            borderRadius: '14px',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            bgcolor: 'rgba(255,255,255,0.12)',
                            backdropFilter: 'blur(6px)'
                        }}
                    >
                        <VideocamRoundedIcon />
                    </Box>
                    <Typography variant="h6" sx={{ fontWeight: 700, letterSpacing: 0.3 }}>
                        MeetSphere
                    </Typography>
                </Stack>

                <Box sx={{ maxWidth: 460 }}>
                    <Typography variant="h3" sx={{ fontWeight: 800, lineHeight: 1.15, mb: 2 }}>
                        Meet. Collaborate. Anywhere.
                    </Typography>
                    <Typography variant="body1" sx={{ color: 'rgba(255,255,255,0.75)', fontSize: '1.05rem' }}>
                        Crystal-clear video meetings, screen sharing, and team collaboration —
                        all in one place.
                    </Typography>

                    <Stack spacing={2} sx={{ mt: 4 }}>
                        <FeatureRow icon={<GroupsRoundedIcon />} text="Host meetings with unlimited participants" />
                        <FeatureRow icon={<ScreenShareRoundedIcon />} text="Share your screen in one click" />
                        <FeatureRow icon={<LockRoundedIcon />} text="End-to-end encrypted, always private" />
                    </Stack>
                </Box>

                <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.45)' }}>
                    © {new Date().getFullYear()} MeetSphere
                </Typography>

                <Box
                    sx={{
                        position: 'absolute',
                        width: 280,
                        height: 280,
                        borderRadius: '50%',
                        bottom: -100,
                        right: -100,
                        background: 'radial-gradient(circle, rgba(124,58,237,0.35), transparent 70%)',
                        filter: 'blur(10px)'
                    }}
                />
            </Box>

            {/* RIGHT — form panel, perfectly centered */}
            <Box
                sx={{
                    flex: { xs: '1 1 100%', md: '0 0 45%' },
                    bgcolor: '#fff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    px: { xs: 3, sm: 6 },
                    overflowY: 'auto'
                }}
            >
                <Box sx={{ width: '100%', maxWidth: 380 }}>
                    <Stack
                        direction="row"
                        alignItems="center"
                        spacing={1.5}
                        sx={{ display: { xs: 'flex', md: 'none' }, mb: 4 }}
                    >
                        <Box
                            sx={{
                                width: 40,
                                height: 40,
                                borderRadius: '12px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                bgcolor: 'primary.main',
                                color: '#fff'
                            }}
                        >
                            <VideocamRoundedIcon fontSize="small" />
                        </Box>
                        <Typography variant="h6" sx={{ fontWeight: 700 }}>
                            MeetUp
                        </Typography>
                    </Stack>

                    <Avatar
                        sx={{
                            display: { xs: 'none', md: 'flex' },
                            bgcolor: 'primary.main',
                            width: 48,
                            height: 48,
                            mb: 2
                        }}
                    >
                        <LockRoundedIcon />
                    </Avatar>

                    <Typography variant="h4" sx={{ fontWeight: 700, mb: 0.5 }}>
                        {tab === 0 ? 'Welcome back' : 'Create your account'}
                    </Typography>
                    <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                        {tab === 0
                            ? 'Sign in to join or start a meeting.'
                            : 'Sign up to start hosting meetings in seconds.'}
                    </Typography>

                    <Tabs
                        value={tab}
                        onChange={handleTabChange}
                        variant="fullWidth"
                        sx={{
                            mb: 3,
                            minHeight: 40,
                            bgcolor: '#f1f3f6',
                            borderRadius: '10px',
                            p: 0.5,
                            '& .MuiTabs-indicator': { display: 'none' },
                            '& .MuiTab-root': {
                                minHeight: 36,
                                borderRadius: '8px',
                                fontWeight: 600,
                                textTransform: 'none',
                                color: 'text.secondary'
                            },
                            '& .Mui-selected': {
                                bgcolor: '#fff',
                                color: 'text.primary !important',
                                boxShadow: '0 1px 4px rgba(0,0,0,0.12)'
                            }
                        }}
                    >
                        <Tab label="Sign In" />
                        <Tab label="Sign Up" />
                    </Tabs>

                    <Box component="form" noValidate onSubmit={handleAuth}>
                        <Stack spacing={2.25}>
                            {tab === 1 && (
                                <TextField
                                    required
                                    fullWidth
                                    id="name"
                                    label="Full Name"
                                    name="name"
                                    autoComplete="name"
                                    autoFocus
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                />
                            )}

                            <TextField
                                required
                                fullWidth
                                id="username"
                                label="Username"
                                name="username"
                                autoComplete="username"
                                autoFocus={tab === 0}
                                value={username}
                                onChange={(e) => setUsername(e.target.value)}
                            />

                            <TextField
                                required
                                fullWidth
                                id="password"
                                name="password"
                                label="Password"
                                type={showPassword ? 'text' : 'password'}
                                autoComplete={tab === 0 ? 'current-password' : 'new-password'}
                                value={password}
                                onChange={(e) => setPassword(e.target.value)}
                                InputProps={{
                                    endAdornment: (
                                        <InputAdornment position="end">
                                            <IconButton
                                                onClick={() => setShowPassword((show) => !show)}
                                                edge="end"
                                                aria-label="toggle password visibility"
                                            >
                                                {showPassword ? <VisibilityOff /> : <Visibility />}
                                            </IconButton>
                                        </InputAdornment>
                                    )
                                }}
                            />

                            {error && <Alert severity="error">{error}</Alert>}

                            <Button
                                type="submit"
                                fullWidth
                                variant="contained"
                                size="large"
                                disabled={loading}
                                sx={{
                                    py: 1.3,
                                    borderRadius: '10px',
                                    textTransform: 'none',
                                    fontWeight: 700,
                                    fontSize: '1rem',
                                    boxShadow: 'none'
                                }}
                            >
                                {loading ? (
                                    <CircularProgress size={22} color="inherit" />
                                ) : tab === 0 ? (
                                    'Sign In'
                                ) : (
                                    'Create Account'
                                )}
                            </Button>
                        </Stack>
                    </Box>
                </Box>
            </Box>

            <Snackbar
                open={snackbar.open}
                autoHideDuration={4000}
                onClose={() => setSnackbar({ open: false, message: '' })}
                message={snackbar.message}
                anchorOrigin={{ vertical: 'bottom', horizontal: 'center' }}
            />
        </Box>
    );
}

function FeatureRow({ icon, text }) {
    return (
        <Stack direction="row" alignItems="center" spacing={1.5}>
            <Box
                sx={{
                    width: 34,
                    height: 34,
                    borderRadius: '9px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    bgcolor: 'rgba(255,255,255,0.1)',
                    flexShrink: 0
                }}
            >
                {icon}
            </Box>
            <Typography variant="body2" sx={{ color: 'rgba(255,255,255,0.85)' }}>
                {text}
            </Typography>
        </Stack>
    );
}