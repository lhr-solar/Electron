import React, { useEffect, useState } from 'react';
import { Box, Divider, Paper, Typography, FormControl, InputLabel, Select, MenuItem, Button, TextField, CircularProgress } from "@mui/material";

const Home = () => {
    const [adapters, setAdapters] = useState([]);
    const [selected, setSelected] = useState('');
    const [form, setForm] = useState({});
    const [loading, setLoading] = useState(false);
    const [submitStatus, setSubmitStatus] = useState(null);
    const [adapterFields, setAdapterFields] = useState({});

    useEffect(() => {
        setLoading(true);
        fetch('http://localhost:5000/api/get_adapter_form_data')
            .then(res => res.json())
            .then(data => {
                const adapterList = Object.keys(data).map(key => ({
                    label: key,
                    value: key.toLowerCase().replace(/\s/g, '_')
                }));
                setAdapters(adapterList);
                setAdapterFields(data);
                if (adapterList.length > 0) {
                    setSelected(adapterList[0].value);
                }
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, []);

    useEffect(() => {
        // Set default values when adapter changes
        const defaults = {
            can_bitrate: '125000',
            dev_baudrate: '9600',
            server_ip: '3.141.38.115',
            server_port: '5700'
        };
        setForm(defaults);
    }, [selected]);

    const handleChange = (e) => {
        setSelected(e.target.value);
    };

    const handleFieldChange = (e) => {
        setForm(f => ({ ...f, [e.target.name]: e.target.value }));
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        
        // Validate required fields
        const requiredFields = fields.filter(field => field.required);
        const missingFields = requiredFields.filter(field => !form[field.name] || form[field.name] === '');
        
        if (missingFields.length > 0) {
            setSubmitStatus('validation_error');
            return;
        }
        
        setSubmitStatus(null);
        setLoading(true);
        try {
            const res = await fetch(`http://localhost:5000/api/adapter_configure`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ adapter: selected, ...form })
            });
            if (res.ok) {
                setSubmitStatus('success');
            } else {
                setSubmitStatus('error');
            }
        } catch {
            setSubmitStatus('error');
        }
        setLoading(false);
    };

    const selectedAdapterKey = Object.keys(adapterFields).find(key => 
        key.toLowerCase().replace(/\s/g, '_') === selected
    );
    const fields = selectedAdapterKey ? adapterFields[selectedAdapterKey] || [] : [];

    const renderField = (field) => {
        if (field.type === 'select') {
            return (
                <FormControl key={field.name} fullWidth sx={{ mb: 2 }} required={field.required}>
                    <InputLabel id={`${field.name}-label`} sx={{ color: '#bbb' }}>{field.label}</InputLabel>
                    <Select
                        labelId={`${field.name}-label`}
                        name={field.name}
                        value={form[field.name] || ''}
                        label={field.label}
                        onChange={handleFieldChange}
                        required={field.required}
                        sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: '#888' } }}
                    >
                        {field.options.map((option, index) => (
                            <MenuItem key={index} value={option}>{option}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            );
        } else {
            return (
                <TextField
                    key={field.name}
                    name={field.name}
                    label={field.label}
                    type={field.type}
                    required={field.required}
                    value={form[field.name] || ''}
                    onChange={handleFieldChange}
                    fullWidth
                    sx={{ mb: 2, input: { color: 'white' }, label: { color: '#bbb' } }}
                    InputLabelProps={{ style: { color: '#bbb' } }}
                />
            );
        }
    };

    return (
        <Paper sx={{ padding: 3, backgroundColor: "#1e1e1e", maxWidth: 500, mx: 'auto', mt: 4 }}>
            <Typography variant="h5" sx={{ mb: 2, color: 'white' }}>Adapter Configuration</Typography>
            <Divider sx={{ mb: 3, background: '#444' }} />
            <FormControl fullWidth sx={{ mb: 3 }}>
                <InputLabel id="adapter-select-label" sx={{ color: 'white' }}>Adapter</InputLabel>
                <Select
                    labelId="adapter-select-label"
                    value={selected}
                    label="Adapter"
                    onChange={handleChange}
                    sx={{ color: 'white', '.MuiOutlinedInput-notchedOutline': { borderColor: '#888' } }}
                >
                    {adapters.map(opt => (
                        <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>
                    ))}
                </Select>
            </FormControl>
            <form onSubmit={handleSubmit} autoComplete="off">
                {fields.map(renderField)}
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mt: 2 }}>
                    <Button type="submit" variant="contained" color="primary" disabled={loading}>
                        {loading ? <CircularProgress size={24} color="inherit" /> : 'Connect'}
                    </Button>
                    {submitStatus === 'success' && <Typography color="success.main">Success!</Typography>}
                    {submitStatus === 'error' && <Typography color="error.main">Error!</Typography>}
                    {submitStatus === 'validation_error' && <Typography color="error.main">Please fill in all required fields</Typography>}
                </Box>
            </form>
        </Paper>
    );
};

export default Home;